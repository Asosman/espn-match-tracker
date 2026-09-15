// index.js
import config from './config/env.js';
import logger from './utils/logger.js';
import db from './services/db.js';
import realFacebook from './services/facebook.js';
import mockFacebook from './mock/mockFacebookClient.js';
import { fetchTodaysMatches } from './services/espn.js';
import { formatFixturesPost, compareMatchState, formatEventPost, formatLineupPost } from './services/eventEngine.js';
import { monitoringManager } from './services/monitoringManager.js';
import { displayFixturesSummary, promptMainMenu, promptMatchSelection, promptMonitoringSubmenu, promptMatchDetailSelection, displayMatchDetails } from './cli/selector.js';
import { formatDateDisplayWAT, getYesterdayDateIsoWAT } from './utils/time.js';
import { MOCK_MATCH_LIFECYCLE } from './mock/sampleData.js';
import { fetchMatchDetails } from './services/espn.js';


const isMock = config.isMockMode;
const fbClient = isMock ? mockFacebook : realFacebook;

/**
 * Handles graceful shutdown on Ctrl+C.
 */
function setupGracefulShutdown() {
  const shutdown = async () => {
    console.log('\n');
    logger.info('Graceful shutdown initiated...');
    monitoringManager.stop();
    logger.info('Database state saved. Clean exit complete.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Runs the full lifecycle simulation in Mock Mode.
 */
async function runMockSimulation() {
  const totalSteps = MOCK_MATCH_LIFECYCLE.length;
  console.log('\n════════════════════════════════════════════════════');
  console.log(`   STARTING MOCK SIMULATION (${totalSteps} MATCH LIFECYCLE STATES)   `);
  console.log('════════════════════════════════════════════════════\n');
  logger.info('Running in zero-network MOCK mode...');

  await db.initDb();

  // Always reset the mock fixture record in the database first to guarantee a clean simulation run
  if (MOCK_MATCH_LIFECYCLE.length > 0) {
    const mockFixtureId = MOCK_MATCH_LIFECYCLE[0].fixtureId;
    await db.removeMatchRecord(mockFixtureId);
    logger.info(`Cleared mock fixture ${mockFixtureId} from database to start fresh.`);
  }

  for (const stepState of MOCK_MATCH_LIFECYCLE) {
    console.log(`\n----------------------------------------------------`);
    console.log(`▶ STEP ${stepState.step}/${totalSteps}: ${stepState.title}`);
    console.log(`Status: ${stepState.status.state} (${stepState.status.description}), Clock: ${stepState.status.clock}, Score: ${stepState.score.home}-${stepState.score.away}`);
    console.log(`----------------------------------------------------`);

    const fixtureId = stepState.fixtureId;
    const prevRecord = await db.getMatchRecord(fixtureId);

    const { newEvents, goalPostEdits, injuryPostEdits, lineupPostAction } = compareMatchState(
      prevRecord,
      stepState
    );

    const postedEventsSet = new Set(prevRecord?.postedEvents || []);
    const goalPosts = { ...(prevRecord?.goalPosts || {}) };
    const injuryEvents = [...(prevRecord?.injuryEvents || [])];
    let lineupsPosted = Boolean(prevRecord?.lineupsPosted);
    let lineupPostId = prevRecord?.lineupPostId || null;

    // Lineup gating check
    if (lineupPostAction === 'PUBLISH') {
      const lineupMsg = formatLineupPost(stepState, stepState.lineups.home, stepState.lineups.away);
      lineupPostId = await mockFacebook.createPagePost(lineupMsg);
      lineupsPosted = true;
      
      console.log(`\n📢 [FACEBOOK LINEUPS POSTED]`);
      console.log(lineupMsg);
      console.log(`════════════════════════════════════════════════════`);
    } else if (lineupPostAction === 'SKIP') {
      lineupsPosted = true;
      logger.info(`[MOCK LINEUP GATE] Match has already kicked off. Lineup card permanently skipped.`);
    }

    // Process new events
    for (const ev of newEvents) {
      const postMsg = formatEventPost(ev, stepState);
      const postId = await mockFacebook.createPagePost(postMsg);
      if (ev.sig) postedEventsSet.add(ev.sig);

      console.log(`\n⚡ [FACEBOOK EVENT POSTED: ${ev.type}]`);
      console.log(postMsg);
      console.log(`════════════════════════════════════════════════════`);

      if (ev.type === 'GOAL' && ev.goalKey) {
        goalPosts[ev.goalKey] = {
          postId,
          scorer: ev.player || null,
          assist: ev.assist || null,
        };
      }
      if (ev.type === 'INJURY') {
        injuryEvents.push({
          minute: ev.minute,
          player: ev.player || null,
          postId,
        });
      }
    }

    // Process goal edits (scorer/assist resolution)
    for (const edit of goalPostEdits) {
      const updatedMsg = formatEventPost(edit.event, stepState);
      await mockFacebook.updatePagePost(edit.postId, updatedMsg);
      goalPosts[edit.goalKey] = {
        postId: edit.postId,
        scorer: edit.event.player || null,
        assist: edit.event.assist || null,
      };

      console.log(`\n✏️ [FACEBOOK GOAL POST UPDATED]`);
      console.log(updatedMsg);
      console.log(`════════════════════════════════════════════════════`);
    }

    // Process injury edits
    for (const edit of injuryPostEdits) {
      const updatedMsg = formatEventPost(edit.event, stepState);
      await mockFacebook.updatePagePost(edit.postId, updatedMsg);
      const inj = injuryEvents.find((i) => i.minute === edit.event.minute);
      if (inj) inj.player = edit.event.player;

      console.log(`\n✏️ [FACEBOOK INJURY POST UPDATED]`);
      console.log(updatedMsg);
      console.log(`════════════════════════════════════════════════════`);
    }

    // Persist to database
    await db.saveMatchRecord(fixtureId, {
      fixtureId,
      homeName: stepState.homeName,
      awayName: stepState.awayName,
      leagueName: stepState.leagueName,
      leagueSlug: stepState.leagueSlug,
      lineupsPosted,
      lineupPostId,
      lastScore: stepState.score,
      postedEvents: Array.from(postedEventsSet),
      goalPosts,
      injuryEvents,
      lastStatus: stepState.status.state,
      lastPeriod: stepState.status.period,
      lastClock: stepState.status.clock,
    });

    // Small delay between steps for readability
    await new Promise((res) => setTimeout(res, 500));
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('   MOCK SIMULATION COMPLETED SUCCESSFULLY!        ');
  console.log(`   All ${totalSteps} steps verified. Database state updated.  `);
  console.log('════════════════════════════════════════════════════\n');
}

/**
 * Main application CLI lifecycle in live mode.
 */
async function runLiveApp() {
  await db.initDb();
  setupGracefulShutdown();

  logger.info("Fetching today's fixtures strictly for Africa/Lagos calendar day...");
  const matches = await fetchTodaysMatches();

  displayFixturesSummary(matches);

  let keepRunningMenu = true;

  while (keepRunningMenu) {
    const action = await promptMainMenu();

    if (action === 'exit') {
      logger.info('Exiting application. Goodbye!');
      process.exit(0);
    }

    if (action === 'post' || action === 'both') {
      const fixturesPost = formatFixturesPost(matches, formatDateDisplayWAT());
      logger.info("Posting today's fixtures to Facebook...");
      const postId = await fbClient.createPagePost(fixturesPost);
      if (postId) {
        console.log(`\n✅ Fixtures posted to Facebook successfully! Post ID: ${postId}\n`);
      } else {
        console.log(`\n⚠️ Fixtures post queued/simulated.\n`);
      }
    }

    if (action === 'yesterday' || action === 'post_yesterday') {
      const yesterdayDate = getYesterdayDateIsoWAT();
      logger.info(`Fetching yesterday's fixtures for ${yesterdayDate}...`);
      const yMatches = await fetchTodaysMatches(yesterdayDate);
      displayFixturesSummary(yMatches);

      if (action === 'post_yesterday') {
        const fixturesPost = formatFixturesPost(yMatches, `Yesterday (${yesterdayDate})`);
        logger.info("Posting yesterday's fixtures to Facebook...");
        const postId = await fbClient.createPagePost(fixturesPost);
        if (postId) {
          console.log(`\n✅ Yesterday's results posted to Facebook successfully! Post ID: ${postId}\n`);
        } else {
          console.log(`\n⚠️ Yesterday's post queued/simulated.\n`);
        }
      }
    }

    if (action === 'details') {
      const fixtureId = await promptMatchDetailSelection(matches);
      if (fixtureId) {
        const match = await fetchMatchDetails(fixtureId);
        if (match) {
          displayMatchDetails(match);
        } else {
          console.log('⚠️ Could not fetch match details.');
        }
      }
    }

    if (action === 'monitor' || action === 'both') {
      const selectedIds = await promptMatchSelection(matches, monitoringManager.getMonitoredFixtureIds());
      if (selectedIds.length > 0) {
        monitoringManager.setMonitoredMatches(selectedIds);
        monitoringManager.start();

        // Monitoring active interactive submenu
        let inSubmenu = true;
        while (inSubmenu) {
          const subChoice = await promptMonitoringSubmenu(
            monitoringManager.getMonitoredFixtureIds().length,
            config.monitoring.maxMonitoredMatches
          );

          if (subChoice === 'add') {
            const addedIds = await promptMatchSelection(matches, monitoringManager.getMonitoredFixtureIds());
            monitoringManager.setMonitoredMatches(addedIds);
          } else if (subChoice === 'remove') {
            const currentIds = monitoringManager.getMonitoredFixtureIds();
            const toRemove = matches.filter((m) => currentIds.includes(String(m.fixtureId)));
            const selected = await promptMatchSelection(toRemove, []);
            selected.forEach((id) => monitoringManager.removeMatch(id));
          } else if (subChoice === 'view') {
            const activeIds = monitoringManager.getMonitoredFixtureIds();
            console.log(`\nCurrently Monitoring (${activeIds.length} matches):`);
            matches
              .filter((m) => activeIds.includes(String(m.fixtureId)))
              .forEach((m) => console.log(` - ${m.homeName} vs ${m.awayName} (${m.leagueName}) [${m.fixtureId}]`));
          } else if (subChoice === 'continue') {
            console.log('\nContinuing background monitoring loop. Press Enter anytime for menu.\n');
            await new Promise((res) => setTimeout(res, 5000));
          } else if (subChoice === 'exit') {
            monitoringManager.stop();
            process.exit(0);
          }
        }
      }
    }
  }
}

// Entrypoint dispatch
if (isMock) {
  runMockSimulation().catch((err) => {
    logger.critical(`Mock execution crashed: ${err.message}`);
    process.exit(1);
  });
} else {
  runLiveApp().catch((err) => {
    logger.critical(`Application encountered fatal error: ${err.message}`);
    process.exit(1);
  });
}
