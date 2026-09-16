// services/monitoringManager.js
import config from '../config/env.js';
import logger from '../utils/logger.js';
import db from './db.js';
import realFacebook from './facebook.js';
import mockFacebook from '../mock/mockFacebookClient.js';
import { fetchMatchDetails } from './espn.js';
import { compareMatchState, formatEventPost, formatLineupPost, isWhitelistedEvent } from './eventEngine.js';

class MonitoringManager {
  constructor() {
    this.monitoredFixtureIds = new Set();
    this.isRunning = false;
    this.pollTimeoutId = null;
    this.cycleCount = 0;
    this.lastPollTimestamp = null;
    this.fullTimeGraceCycles = new Map(); // tracks full-time removal
    this.matchLocks = new Map(); // Per-match concurrency protection
  }

  get facebook() {
    return config.isMockMode ? mockFacebook : realFacebook;
  }

  /**
   * Concurrency protection: ensures only one polling cycle processes a match at any given time.
   * @template T
   * @param {string} fixtureId
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  async withMatchLock(fixtureId, task) {
    const id = String(fixtureId);
    while (this.matchLocks.has(id)) {
      await this.matchLocks.get(id);
    }

    let release;
    const lockPromise = new Promise((resolve) => {
      release = resolve;
    });
    this.matchLocks.set(id, lockPromise);

    try {
      return await task();
    } finally {
      this.matchLocks.delete(id);
      release();
    }
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
   * Concurrency-protected via per-match locking.
   * @param {string} fixtureId
   */
  async processMatch(fixtureId) {
    return this.withMatchLock(fixtureId, async () => {
      const prevRecord = await db.getMatchRecord(fixtureId);
      const leagueSlug = prevRecord?.leagueSlug || 'eng.1';

      // 1. Fetch current normalized ESPN state
      const currentMatch = await fetchMatchDetails(fixtureId, leagueSlug, prevRecord);
      if (!currentMatch) {
        logger.warn(`Could not retrieve details for fixture ${fixtureId}; skipping this cycle.`);
        return;
      }

      // 2. Compare states and detect transitions/events
      const {
        newEvents,
        goalPostEdits,
        eventPostEdits,
        lineupPostAction,
        events: canonicalEvents,
        facebookPosts: canonicalFacebookPosts,
      } = compareMatchState(prevRecord, currentMatch);

      let lineupsPosted = Boolean(prevRecord?.lineupsPosted);
      let lineupPostId = prevRecord?.lineupPostId || null;

      // 3. Handle Starting Lineups
      if (lineupPostAction === 'PUBLISH' && !lineupsPosted) {
        const lineupMsg = formatLineupPost(currentMatch, currentMatch.lineups.home, currentMatch.lineups.away);
        logger.info(`Publishing official starting lineups for ${currentMatch.homeName} vs ${currentMatch.awayName}...`);
        lineupPostId = await this.facebook.createPagePost(lineupMsg);
        lineupsPosted = true;

        await db.saveMatchRecord(fixtureId, {
          ...currentMatch,
          lineupsPosted: true,
          lineupPostId,
          events: canonicalEvents,
          facebookPosts: canonicalFacebookPosts,
        });
      } else if (lineupPostAction === 'SKIP') {
        lineupsPosted = true;
      }

      // 4. ATOMIC SEQUENCE STEP 1: Persist pending events to DB BEFORE calling Facebook API
      if (newEvents.length > 0) {
        await db.saveMatchRecord(fixtureId, {
          matchId: fixtureId,
          fixtureId,
          homeName: currentMatch.homeName,
          awayName: currentMatch.awayName,
          homeTeam: currentMatch.homeName,
          awayTeam: currentMatch.awayName,
          leagueName: currentMatch.leagueName,
          leagueSlug: currentMatch.leagueSlug,
          lineupsPosted,
          lineupPostId,
          score: currentMatch.score,
          lastScore: currentMatch.score,
          status: currentMatch.status,
          lastStatus: currentMatch.status.state,
          lastPeriod: currentMatch.status.period,
          lastClock: currentMatch.status.clock,
          events: canonicalEvents,
          facebookPosts: canonicalFacebookPosts,
          eventStates: canonicalEvents,
        });
      }

      // 5. Publish New Events with duplicate pre-check
      for (const ev of newEvents) {
        if (!isWhitelistedEvent(ev)) continue;

        // PRE-CHECK: Check if Facebook post already exists for this event
        const existingPostId = canonicalEvents[ev.eventId]?.facebookPostId || prevRecord?.facebookPosts?.[ev.eventId]?.postId;
        if (existingPostId) {
          logger.warn(`[DUPLICATE PROTECTION] Facebook post already exists (${existingPostId}) for event ${ev.eventId}. Skipping.`);
          continue;
        }

        const postMsg = formatEventPost(ev, currentMatch);
        logger.info(`Publishing new event: [${ev.type}] (${ev.eventId}) for ${currentMatch.homeName} vs ${currentMatch.awayName}`);
        const postId = await this.facebook.createPagePost(postMsg);

        if (postId) {
          // Finalize event status and store Facebook post ID
          canonicalEvents[ev.eventId] = {
            ...canonicalEvents[ev.eventId],
            facebookPostId: postId,
            status: 'VALID',
            postedAt: new Date().toISOString(),
          };

          canonicalFacebookPosts[postId] = {
            postId,
            eventId: ev.eventId,
            type: ev.type,
            createdAt: canonicalEvents[ev.eventId].postedAt,
          };

          // ATOMIC STEP 2: Persist Facebook post ID immediately
          await db.recordFacebookPost(fixtureId, postId, ev.eventId, ev.type);
        }
      }

      // 6. Apply Post Edits (when scorer, assist, red card player resolve, or goal disallowed)
      const editsToApply = eventPostEdits?.length > 0 ? eventPostEdits : (goalPostEdits || []);
      for (const edit of editsToApply) {
        if (!edit.postId) continue;

        const updatedMsg = formatEventPost(edit.event, currentMatch);
        logger.info(`Updating Facebook post ${edit.postId} (${edit.eventId}) with newly resolved details...`);
        const success = await this.facebook.updatePagePost(edit.postId, updatedMsg);

        if (success && edit.eventId && canonicalEvents[edit.eventId]) {
          canonicalEvents[edit.eventId].lastContentSignature = edit.newContentSig;
          if (edit.isDisallowed) {
            canonicalEvents[edit.eventId].status = 'DISALLOWED';
          }
          await db.saveMatchEvent(fixtureId, edit.eventId, canonicalEvents[edit.eventId]);
        }
      }

      // 7. Persist Final Canonical Match State
      const postedEventsList = Object.values(canonicalEvents)
        .filter((e) => e.facebookPostId || e.status === 'VALID' || e.status === 'POSTED')
        .map((e) => e.eventId);

      const goalPostsMap = {};
      for (const e of Object.values(canonicalEvents)) {
        if ((e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') && e.facebookPostId) {
          const key = e.goalKey || `${e.minute}:${e.scoreAfterEvent?.home}-${e.scoreAfterEvent?.away}`;
          goalPostsMap[key] = {
            postId: e.facebookPostId,
            scorer: e.player || null,
            assist: e.assist || null,
          };
        }
      }

      await db.saveMatchRecord(fixtureId, {
        matchId: fixtureId,
        fixtureId,
        homeId: currentMatch.homeId,
        awayId: currentMatch.awayId,
        homeName: currentMatch.homeName,
        awayName: currentMatch.awayName,
        homeTeam: currentMatch.homeName,
        awayTeam: currentMatch.awayName,
        leagueName: currentMatch.leagueName,
        leagueSlug: currentMatch.leagueSlug,
        lineupsPosted,
        lineupPostId,
        score: currentMatch.score,
        lastScore: currentMatch.score,
        status: currentMatch.status,
        lastStatus: currentMatch.status.state,
        lastPeriod: currentMatch.status.period,
        lastClock: currentMatch.status.clock,
        events: canonicalEvents,
        facebookPosts: canonicalFacebookPosts,
        // Backward-compatibility properties
        eventStates: canonicalEvents,
        postedEvents: postedEventsList,
        goalPosts: goalPostsMap,
      });

      // 8. Full-time retirement handling: retire after 3 grace cycles
      if (currentMatch.status.state === 'post') {
        const count = (this.fullTimeGraceCycles.get(fixtureId) || 0) + 1;
        this.fullTimeGraceCycles.set(fixtureId, count);
        if (count >= 3) {
          logger.info(`Match ${currentMatch.homeName} vs ${currentMatch.awayName} has completed (Full-Time grace period elapsed). Removing from active polling.`);
          this.monitoredFixtureIds.delete(fixtureId);
        }
      }
    });
  }
}

export const monitoringManager = new MonitoringManager();
export default monitoringManager;
