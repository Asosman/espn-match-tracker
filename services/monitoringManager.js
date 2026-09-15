// services/monitoringManager.js
import config from '../config/env.js';
import logger from '../utils/logger.js';
import db from './db.js';
import realFacebook from './facebook.js';
import mockFacebook from '../mock/mockFacebookClient.js';
import { fetchMatchDetails } from './espn.js';
import { compareMatchState, formatEventPost, formatLineupPost } from './eventEngine.js';

class MonitoringManager {
  constructor() {
    this.monitoredFixtureIds = new Set();
    this.isRunning = false;
    this.pollTimeoutId = null;
    this.cycleCount = 0;
    this.lastPollTimestamp = null;
    this.fullTimeGraceCycles = new Map(); // tracks full-time removal
  }

  get facebook() {
    return config.isMockMode ? mockFacebook : realFacebook;
  }

  /**
   * Adds a fixture ID to the active monitoring set.
   * Enforces the maximum limit of 15 matches.
   * @param {string} fixtureId
   * @returns {boolean} true if added, false if limit reached
   */
  addMatch(fixtureId) {
    if (this.monitoredFixtureIds.size >= config.monitoring.maxMonitoredMatches) {
      logger.warn(`Cannot add fixture ${fixtureId}: maximum limit of ${config.monitoring.maxMonitoredMatches} matches reached.`);
      return false;
    }
    this.monitoredFixtureIds.add(String(fixtureId));
    logger.info(`Added fixture ${fixtureId} to monitoring queue. Current count: ${this.monitoredFixtureIds.size}/${config.monitoring.maxMonitoredMatches}`);
    return true;
  }

  /**
   * Removes a fixture ID from the active monitoring set.
   * @param {string} fixtureId
   * @returns {boolean}
   */
  removeMatch(fixtureId) {
    const deleted = this.monitoredFixtureIds.delete(String(fixtureId));
    if (deleted) {
      logger.info(`Removed fixture ${fixtureId} from monitoring. Remaining: ${this.monitoredFixtureIds.size}`);
    }
    return deleted;
  }

  /**
   * Replaces the entire monitored fixtures set.
   * @param {string[]} fixtureIds
   * @returns {number} number of fixtures added
   */
  setMonitoredMatches(fixtureIds) {
    this.monitoredFixtureIds.clear();
    const limited = fixtureIds.slice(0, config.monitoring.maxMonitoredMatches);
    limited.forEach((id) => this.monitoredFixtureIds.add(String(id)));
    logger.info(`Monitored fixtures set updated: ${this.monitoredFixtureIds.size} matches active.`);
    return this.monitoredFixtureIds.size;
  }

  /**
   * Returns list of currently monitored fixture IDs.
   * @returns {string[]}
   */
  getMonitoredFixtureIds() {
    return Array.from(this.monitoredFixtureIds);
  }

  /**
   * Starts the non-overlapping polling loop.
   */
  async start() {
    if (this.isRunning) {
      logger.warn('MonitoringManager is already running.');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ESPN Football Live Monitor (Interval: ${config.monitoring.pollIntervalMs / 1000}s, Max Matches: ${config.monitoring.maxMonitoredMatches})`);
    this.scheduleNextCycle(100);
  }

  /**
   * Stops the monitoring loop gracefully.
   */
  stop() {
    this.isRunning = false;
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
    logger.info('MonitoringManager stopped.');
  }

  /**
   * Schedules the next polling cycle only after current cycle finishes.
   * @param {number} delayMs
   */
  scheduleNextCycle(delayMs = config.monitoring.pollIntervalMs) {
    if (!this.isRunning) return;
    this.pollTimeoutId = setTimeout(async () => {
      await this.runMonitoringCycle();
      if (this.isRunning) {
        this.scheduleNextCycle(config.monitoring.pollIntervalMs);
      }
    }, delayMs);
  }

  /**
   * Runs a single monitoring iteration across all monitored matches.
   */
  async runMonitoringCycle() {
    this.cycleCount++;
    this.lastPollTimestamp = new Date().toISOString();
    const fixtureIds = Array.from(this.monitoredFixtureIds);

    if (fixtureIds.length === 0) {
      logger.debug(`Polling cycle #${this.cycleCount}: No matches currently selected for monitoring.`);
      return;
    }

    logger.info(`[CYCLE #${this.cycleCount}] Polling ESPN data for ${fixtureIds.length} monitored matches...`);

    for (const fixtureId of fixtureIds) {
      try {
        await this.processMatch(fixtureId);
      } catch (err) {
        logger.error(`Error processing fixture ${fixtureId}: ${err.message}`);
      }
    }
  }

  /**
   * Processes a single match through the event comparison and publishing lifecycle.
   * @param {string} fixtureId
   */
  async processMatch(fixtureId) {
    const prevRecord = await db.getMatchRecord(fixtureId);
    const leagueSlug = prevRecord?.leagueSlug || 'eng.1';

    // 1. Fetch current normalized ESPN state
    const currentMatch = await fetchMatchDetails(fixtureId, leagueSlug, prevRecord);
    if (!currentMatch) {
      logger.warn(`Could not retrieve details for fixture ${fixtureId}; skipping this cycle.`);
      return;
    }
    
    // 2. Compare states and detect transitions/events
    const { newEvents, goalPostEdits, injuryPostEdits, lineupPostAction } = compareMatchState(
      prevRecord,
      currentMatch
    );

    const postedEventsSet = new Set(prevRecord?.postedEvents || []);
    const goalPosts = { ...(prevRecord?.goalPosts || {}) };
    const injuryEvents = [...(prevRecord?.injuryEvents || [])];
    let lineupsPosted = Boolean(prevRecord?.lineupsPosted);
    let lineupPostId = prevRecord?.lineupPostId || null;

    // 3. Handle Starting Lineups
    if (lineupPostAction === 'PUBLISH') {
      const lineupMsg = formatLineupPost(currentMatch, currentMatch.lineups.home, currentMatch.lineups.away);
      logger.info(`Publishing official starting lineups for ${currentMatch.homeName} vs ${currentMatch.awayName}...`);
      lineupPostId = await this.facebook.createPagePost(lineupMsg);
      lineupsPosted = true;
    } else if (lineupPostAction === 'SKIP') {
      lineupsPosted = true; // Permanently marked to stop retrying post-kickoff
    }

    // 4. Publish New Events
    for (const ev of newEvents) {
      const postMsg = formatEventPost(ev, currentMatch);
      logger.info(`Publishing new event: [${ev.type}] for ${currentMatch.homeName} vs ${currentMatch.awayName}`);
      const postId = await this.facebook.createPagePost(postMsg);

      if (ev.sig) postedEventsSet.add(ev.sig);

      // Track goal posts for future edits
      if (ev.type === 'GOAL' && ev.goalKey) {
        goalPosts[ev.goalKey] = {
          postId,
          scorer: ev.player || null,
          assist: ev.assist || null,
        };
      }

      // Track injury posts for future edits
      if (ev.type === 'INJURY') {
        injuryEvents.push({
          minute: ev.minute,
          player: ev.player || null,
          postId,
        });
      }
    }

    // 5. Apply Goal Post Edits (when scorer or assist resolve later)
    for (const edit of goalPostEdits) {
      const updatedMsg = formatEventPost(edit.event, currentMatch);
      logger.info(`Updating Facebook goal post ${edit.postId} with newly resolved scorer/assist...`);
      await this.facebook.updatePagePost(edit.postId, updatedMsg);

      goalPosts[edit.goalKey] = {
        postId: edit.postId,
        scorer: edit.event.player || null,
        assist: edit.event.assist || null,
      };
    }

    // 6. Apply Injury Post Edits (when player name resolves later)
    for (const edit of injuryPostEdits) {
      const updatedMsg = formatEventPost(edit.event, currentMatch);
      logger.info(`Updating Facebook injury post ${edit.postId} with resolved player name...`);
      await this.facebook.updatePagePost(edit.postId, updatedMsg);

      const inj = injuryEvents.find((i) => i.minute === edit.event.minute);
      if (inj) inj.player = edit.event.player;
    }

    // 7. Persist Updated Match State Atomically
    await db.saveMatchRecord(fixtureId, {
      fixtureId,
      homeName: currentMatch.homeName,
      awayName: currentMatch.awayName,
      leagueName: currentMatch.leagueName,
      leagueSlug: currentMatch.leagueSlug,
      lineupsPosted,
      lineupPostId,
      lastScore: currentMatch.score,
      postedEvents: Array.from(postedEventsSet),
      goalPosts,
      injuryEvents,
      lastStatus: currentMatch.status.state,
      lastPeriod: currentMatch.status.period,
      lastClock: currentMatch.status.clock,
    });

    // 8. Full-time retirement handling: If match is full time, retire after 3 grace cycles
    if (currentMatch.status.state === 'post') {
      const count = (this.fullTimeGraceCycles.get(fixtureId) || 0) + 1;
      this.fullTimeGraceCycles.set(fixtureId, count);
      if (count >= 3) {
        logger.info(`Match ${currentMatch.homeName} vs ${currentMatch.awayName} has completed (Full-Time grace period elapsed). Removing from active polling.`);
        this.monitoredFixtureIds.delete(fixtureId);
      }
    }
  }
}

export const monitoringManager = new MonitoringManager();
export default monitoringManager;
