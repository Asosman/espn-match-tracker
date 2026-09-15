// services/eventEngine.js
import { buildMatchHashtags } from '../utils/hashtags.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { eventSignature } from './espn.js';

export const EVENT_EMOJIS = {
  KICKOFF: '🟢',
  GOAL: '⚽',
  GOAL_DISALLOWED: '🚨',
  RED_CARD: '🟥',
  INJURY: '🩹',
  VAR: '📺',
  PENALTY: '🥅',
  PENALTY_SCORED: '🥅',
  PENALTY_MISSED: '❌',
  MISSED_PENALTY: '❌',
  HALF_TIME: '⏱️',
  HALFTIME: '⏱️',
  SECOND_HALF: '🔄',
  FULL_TIME: '🏁',
  FULLTIME: '🏁',
};

/**
 * Builds the Facebook post body for an in-game event.
 * @param {object} event
 * @param {object} currentMatch
 * @returns {string}
 */
export function formatEventPost(event, currentMatch) {
  const clock = event.minute ? `${event.minute}'` : currentMatch.status.clock || 'Live';
  const home = currentMatch.homeName;
  const away = currentMatch.awayName;
  const homeScore = event.homeScore ?? currentMatch.score.home;
  const awayScore = event.awayScore ?? currentMatch.score.away;

  let eventHeader = '📢 MATCH EVENT!';
  let eventLine = '';
  const detailLines = [];

  switch (event.type) {
    case 'KICKOFF':
      eventHeader = '🟢 KICK-OFF! WE ARE UNDERWAY! 🔥';
      eventLine = '🟢 Kick-off! The match has started!';
      break;

    case 'GOAL':
      eventHeader = event.ownGoal ? '😱 OWN GOAL! OH NO! 📉' : '🔥 GOOOOALLLLL! ⚽💥';
      eventLine = event.ownGoal ? '⚽ Own Goal scored!' : '⚽ GOAL! Back of the net!';
      if (event.player) {
        detailLines.push(`🎯 Scorer: ${event.player}`);
      }
      if (event.assist) {
        detailLines.push(`🪄 Assist: ${event.assist} 🅰️`);
      }
      break;

    case 'GOAL_DISALLOWED':
      eventHeader = '🚨 NO GOAL! VAR INTERVENTION! 📺';
      eventLine = '🚨 Goal disallowed by the referee!';
      if (event.player) {
        detailLines.push(`👤 Player: ${event.player}`);
      }
      if (event.reason || event.text) {
        detailLines.push(`📝 Reason: ${event.reason || event.text}`);
      }
      break;

    case 'RED_CARD':
      eventHeader = '🟥 RED CARD! DRAMA IN THE MATCH! 🤯';
      eventLine = event.isSecondYellow ? '🟨🟥 Red Card (Second Yellow)!' : '🟥 Straight Red Card!';
      if (event.player) {
        detailLines.push(`👤 Player: ${event.player} 🚶‍♂️`);
      }
      break;

    case 'INJURY':
      eventHeader = '🩹 INJURY UPDATE 🩺';
      eventLine = '🩹 Player down and receiving medical attention.';
      if (event.player) {
        detailLines.push(`🤕 Injured Player: ${event.player}`);
      }
      break;

    case 'PENALTY_SCORED':
      eventHeader = '⚽ PENALTY SCORED! ICE COLD! 🥶';
      eventLine = '🥅 Penalty converted successfully!';
      if (event.player) {
        detailLines.push(`🎯 Scorer: ${event.player}`);
      }
      break;

    case 'PENALTY_MISSED':
    case 'MISSED_PENALTY':
      eventHeader = '❌ PENALTY MISSED! DRAMA! 😱';
      eventLine = '❌ Penalty missed or saved!';
      if (event.player) {
        detailLines.push(`👤 Player: ${event.player}`);
      }
      break;

    case 'PENALTY':
      if (event.outcome === 'SCORED') {
        eventHeader = '⚽ PENALTY SCORED! ICE COLD! 🥶';
        eventLine = '🥅 Penalty converted successfully!';
        if (event.player) {
          detailLines.push(`🎯 Scorer: ${event.player}`);
        }
      } else if (event.outcome === 'MISSED') {
        eventHeader = '❌ PENALTY MISSED! DRAMA! 😱';
        eventLine = '❌ Penalty missed or saved!';
        if (event.player) {
          detailLines.push(`👤 Player: ${event.player}`);
        }
      } else {
        eventHeader = '🥅 PENALTY AWARDED! 😱';
        eventLine = '🥅 Penalty kick awarded by the referee!';
        if (event.player) {
          detailLines.push(`👤 Taker: ${event.player}`);
        }
      }
      break;

    case 'VAR':
      const isDisallowed = event.text?.toLowerCase().includes('disallowed');
      eventHeader = isDisallowed ? '🚨 NO GOAL! VAR INTERVENTION! 📺' : '📺 VAR DECISION UNDER REVIEW!';
      eventLine = isDisallowed ? '🚨 Goal disallowed after VAR review!' : '📺 Referee checking VAR!';
      if (event.text) {
        detailLines.push(`📝 Review: ${event.text}`);
      }
      break;

    case 'HALF_TIME':
    case 'HALFTIME':
      eventHeader = '⏱️ HALF-TIME WHISTLE! ⏸️';
      eventLine = `⏱️ First half ends. (HT score: ${homeScore} - ${awayScore})`;
      break;

    case 'SECOND_HALF':
      eventHeader = '🔄 SECOND HALF BEGINS! 🔥';
      eventLine = '🔄 Players are back for the second 45 minutes!';
      break;

    case 'EXTRA_TIME_START':
      eventHeader = '⏱️ EXTRA TIME BEGINS! DRAMA DEEPENS! ⚔️🔥';
      eventLine = '⏱️ 90 minutes were not enough! We are heading into 30 minutes of Extra Time!';
      break;

    case 'EXTRA_TIME_HALF':
      eventHeader = '⏱️ EXTRA TIME HALF-TIME! ⏸️';
      eventLine = '⏱️ First period of extra time is complete. Short break before the final 15 minutes!';
      break;

    case 'PENALTY_SHOOTOUT':
      eventHeader = '😱 PENALTY SHOOTOUT! ULTIMATE DRAMA! 🧤⚽';
      eventLine = '🏆 Extra time is over! The winner will be decided by a dramatic penalty shootout!';
      break;

    case 'FULL_TIME':
    case 'FULLTIME':
      eventHeader = '🏁 FULL-TIME! MATCH OVER! 🏆';
      eventLine = `🏁 Final whistle blows. (FT score: ${homeScore} - ${awayScore})`;
      break;

    case 'FULL_TIME_PENDING_ET':
      eventHeader = '🏁 FULL-TIME! HEADING TO EXTRA TIME! ⏱️⚔️';
      eventLine = `🏁 The 90 minutes of normal time are up! (FT Score: ${homeScore} - ${awayScore}). Since it is a tie, we are heading into 30 minutes of EXTRA TIME! 🔥`;
      break;

    case 'FULL_TIME_POST_ET':
      eventHeader = '🏁 FINAL WHISTLE! MATCH OVER! 🏆🔥';
      eventLine = `🏁 The final whistle blows at the end of extra time/penalties! (Final score: ${homeScore} - ${awayScore})`;
      break;

    default:
      eventHeader = `🚨 MATCH EVENT: ${event.type || 'LIVE'}!`;
      eventLine = `🚨 Event detected in the game.`;
  }

  const standardHashtags = '#Livescore #Football #Soccer #Matchday #LiveScore #ViralFootball';
  const customHashtags = buildMatchHashtags(home, away, currentMatch.leagueName);

  const sections = [
    `⚡ ${eventHeader} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `⏱️ Time: ${clock}`,
    `📝 Info: ${eventLine}`,
    `⚽ Score: ${home} ${homeScore} - ${awayScore} ${away}`
  ];

  if (detailLines.length > 0) {
    sections.push(detailLines.join('\n'));
  }

  sections.push(`━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n${customHashtags}\n${standardHashtags}`);

  return sections.join('\n');
}

/**
 * Builds the lineup post body.
 * Formatting: One player per line, no bullets.
 * @param {object} currentMatch
 * @param {string[]} homeLineup
 * @param {string[]} awayLineup
 * @returns {string}
 */
export function formatLineupPost(currentMatch, homeLineup, awayLineup) {
  const homeSection = `${currentMatch.homeName} startingXI; ${homeLineup.join(', ')}`;
  const awaySection = `${currentMatch.awayName} startingXI; ${awayLineup.join(', ')}`;
  const hashtags = buildMatchHashtags(currentMatch.homeName, currentMatch.awayName, currentMatch.leagueName);
  const standardHashtags = '#StartingXI #Lineups #Football #Matchday #LineupNews';

  return `🔥 OFFICIAL STARTING LINEUPS ARE OUT! 📋⚽\n\n💥 ${currentMatch.homeName} 🆚 ${currentMatch.awayName}\n━━━━━━━━━━━━━━━━━━━\n\n${homeSection}\n${awaySection}\n\n━━━━━━━━━━━━━━━━━━━\n👉 Who is winning this clash? Leave your predictions below! 👇\n\n${hashtags}\n${standardHashtags}`;
}

/**
 * Builds today's fixtures summary post grouped by competition.
 * @param {any[]} matches
 * @param {string} dateDisplay
 * @returns {string}
 */
export function formatFixturesPost(matches, dateDisplay) {
  const isYesterday = dateDisplay.toLowerCase().includes('yesterday');
  const grouped = {};
  for (const m of matches) {
    const comp = m.leagueName || 'Football';
    if (!grouped[comp]) grouped[comp] = [];
    grouped[comp].push(m);
  }

  const titleEmoji = isYesterday ? '🏆 RESULTS ARE IN! ⚽🔥' : '🔥 TODAY\'S FOOTBALL FIXTURES! ⚽📅';
  const subtitleEmoji = isYesterday ? '📅 Yesterday\'s Final Scores' : '🕐 Don\'t miss any of the action!';
  
  const lines = [
    `⚡ ${titleEmoji} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📅 Date: ${dateDisplay}`,
    `📢 ${subtitleEmoji}`,
    `🕐 All times are in West Africa Time (WAT)\n`,
  ];

  for (const [league, groupMatches] of Object.entries(grouped)) {
    lines.push(`🏆 ${league.toUpperCase()}\n`);
    groupMatches.forEach((m) => {
      if (isYesterday) {
        lines.push(`FT ${m.homeName} ${m.score?.home ?? 0}-${m.score?.away ?? 0} ${m.awayName}`);
      } else {
        lines.push(`${m.kickoffFormattedWAT || 'TBD'} ${m.homeName} vs ${m.awayName}`);
      }
    });
    lines.push('');
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore #ViralMatch #FootballFans';
  const callToAction = isYesterday
    ? '💬 What do you think about the scorelines? 👇'
    : '💬 Drop your predictions and thoughts below! 👇';
  lines.push(`━━━━━━━━━━━━━━━━━━━\n${callToAction}\n\n${standardHashtags}`);
  return lines.join('\n');
}

/**
 * Core event comparator.
 * Compares current normalized match state against previous state stored in db.
 * Returns new events to publish and updates to existing posts.
 *
 * @param {any} prevRecord
 * @param {any} currentMatch
 * @returns {{ newEvents: any[], goalPostEdits: any[], injuryPostEdits: any[], lineupPostAction: 'PUBLISH'|'SKIP'|null }}
 */
export function compareMatchState(prevRecord, currentMatch) {
  const fixtureId = currentMatch.fixtureId;
  const postedSignatures = new Set(prevRecord?.postedEvents || []);
  const newEvents = [];
  const goalPostEdits = [];
  const injuryPostEdits = [];
  let lineupPostAction = null;

  // 1. HARD GATE: Lineup pre-kickoff publishing rule (Section 18.1)
  const lineupsAlreadyPosted = Boolean(prevRecord?.lineupsPosted);
  const isPreKickoff = currentMatch.status.state === 'pre';

  if (!lineupsAlreadyPosted) {
    if (isPreKickoff) {
      // Check if lineups have resolved
      const hasHome = currentMatch.lineups?.home?.length >= 7;
      const hasAway = currentMatch.lineups?.away?.length >= 7;
      if (hasHome && hasAway) {
        lineupPostAction = 'PUBLISH';
      }
    } else {
      // Match transitioned to 'in' or 'post' without publishing lineups
      logger.info(`[LINEUP GATE] Match ${currentMatch.homeName} vs ${currentMatch.awayName} has kicked off (state=${currentMatch.status.state}). Lineup publishing permanently skipped.`);
      lineupPostAction = 'SKIP';
    }
  }

  // 2. Lifecycle transitions: KICK-OFF
  const prevStatus = prevRecord?.lastStatus || 'pre';
  const currStatus = currentMatch.status.state;

  if (prevStatus === 'pre' && currStatus === 'in') {
    const sig = `${fixtureId}:KICKOFF:0:0-0:all`;
    if (!postedSignatures.has(sig)) {
      const currentTime = new Date();
      const kickoffTime = new Date(currentMatch.kickoff);
      const diffMs = currentTime.getTime() - kickoffTime.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes >= 0 && diffMinutes <= 1) {
        newEvents.push({
          type: 'KICKOFF',
          minute: 1,
          homeScore: currentMatch.score.home,
          awayScore: currentMatch.score.away,
          sig,
        });
      } else {
        logger.info(`[KICKOFF GATE] Skip kickoff post for ${currentMatch.homeName} vs ${currentMatch.awayName}: difference of ${diffMinutes.toFixed(2)} minutes is outside [0, 1] interval.`);
      }
    }
  }

  // 3. Lifecycle: HALF-TIME
  if (
    currentMatch.status.description === 'Halftime' ||
    currentMatch.status.name === 'STATUS_HALFTIME'
  ) {
    const sig = `${fixtureId}:HALF_TIME:45:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'HALF_TIME',
        minute: 45,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // 4. Lifecycle: SECOND HALF
  if (prevRecord?.lastPeriod === 1 && currentMatch.status.period === 2) {
    const sig = `${fixtureId}:SECOND_HALF:46:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'SECOND_HALF',
        minute: 46,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // 4b. Lifecycle: EXTRA TIME START
  if (prevRecord?.lastPeriod === 2 && currentMatch.status.period === 3) {
    const sig = `${fixtureId}:EXTRA_TIME_START:90:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'EXTRA_TIME_START',
        minute: 90,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // 4c. Lifecycle: EXTRA TIME HALF
  if (prevRecord?.lastPeriod === 3 && currentMatch.status.period === 4) {
    const sig = `${fixtureId}:EXTRA_TIME_HALF:105:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'EXTRA_TIME_HALF',
        minute: 105,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // 4d. Lifecycle: PENALTY SHOOTOUT
  if (prevRecord?.lastPeriod === 4 && currentMatch.status.period === 5) {
    const sig = `${fixtureId}:PENALTY_SHOOTOUT:120:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'PENALTY_SHOOTOUT',
        minute: 120,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // 5. Lifecycle: FULL-TIME
  // Case A: Standard full-time in normal time (no extra time)
  if (currStatus === 'post' && (currentMatch.status.period || 2) <= 2) {
    const sig = `${fixtureId}:FULL_TIME:90:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'FULL_TIME',
        minute: 90,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // Case B: End of normal 90 minutes but heading to extra time (status is 'in', period is 2, description is 'Full Time')
  if (
    currStatus === 'in' &&
    currentMatch.status.period === 2 &&
    (currentMatch.status.description === 'Full Time' || currentMatch.status.detail?.toLowerCase().includes('full time'))
  ) {
    const sig = `${fixtureId}:FULL_TIME_PENDING_ET:90:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'FULL_TIME_PENDING_ET',
        minute: 90,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // Case C: Final whistle of the entire match after extra time or penalty shootouts
  if (currStatus === 'post' && (currentMatch.status.period || 2) >= 3) {
    const sig = `${fixtureId}:FULL_TIME_POST_ET:120:${currentMatch.score.home}-${currentMatch.score.away}:all`;
    if (!postedSignatures.has(sig)) {
      newEvents.push({
        type: 'FULL_TIME_POST_ET',
        minute: 120,
        homeScore: currentMatch.score.home,
        awayScore: currentMatch.score.away,
        sig,
      });
    }
  }

  // 6. In-game events from match.events (Goals, Cards, Injuries, Penalties, VAR)
  const currentEvents = currentMatch.events || [];
  const existingGoalPosts = prevRecord?.goalPosts || {};
  const existingInjuries = prevRecord?.injuryEvents || [];

  for (const ev of currentEvents) {
    const sig = eventSignature(ev, fixtureId);

    // Goal handling with post editing for delayed scorer/assist resolution
    if (ev.type === 'GOAL') {
      const goalKey = `${ev.minute}:${ev.homeScore}-${ev.awayScore}`;
      const trackedGoal = existingGoalPosts[goalKey];

      if (!trackedGoal) {
        // Brand new goal!
        if (!postedSignatures.has(sig)) {
          newEvents.push({ ...ev, sig, goalKey });
        }
      } else {
        // Goal was already posted. Check if new metadata (scorer or assist) arrived!
        const scorerAdded = !trackedGoal.scorer && Boolean(ev.player);
        const assistAdded = !trackedGoal.assist && Boolean(ev.assist);

        if ((scorerAdded || assistAdded) && trackedGoal.postId) {
          logger.info(`Resolved additional goal metadata for ${goalKey}: Scorer=${ev.player || 'Same'}, Assist=${ev.assist || 'None'}`);
          goalPostEdits.push({
            postId: trackedGoal.postId,
            goalKey,
            event: ev,
          });
        }
      }
      continue;
    }

    // Injury handling with post editing for delayed player resolution
    if (ev.type === 'INJURY') {
      const trackedInjury = existingInjuries.find((i) => i.minute === ev.minute);
      if (!trackedInjury) {
        if (!postedSignatures.has(sig)) {
          newEvents.push({ ...ev, sig });
        }
      } else if (!trackedInjury.player && ev.player && trackedInjury.postId) {
        logger.info(`Resolved injured player name: ${ev.player}`);
        injuryPostEdits.push({
          postId: trackedInjury.postId,
          event: ev,
        });
      }
      continue;
    }

    // Other events (Red cards, Penalties, VAR)
    if (!postedSignatures.has(sig)) {
      newEvents.push({ ...ev, sig });
    }
  }

  const currentTime = new Date();
  const filteredNewEvents = newEvents.filter((ev) => {
    if (config.isMockMode) {
      return true;
    }
    const eventOccurrenceTime = new Date(ev.occurrenceTime || currentTime);
    const diffMs = currentTime.getTime() - eventOccurrenceTime.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    const isWithinWindow = diffMinutes >= 0 && diffMinutes <= 5;
    if (!isWithinWindow) {
      logger.info(`[TIMING GATE] Skip event post for ${currentMatch.homeName} vs ${currentMatch.awayName} (${ev.type}): difference of ${diffMinutes.toFixed(2)} minutes is outside the [0, 5] minutes allowed window.`);
    }
    return isWithinWindow;
  });

  return {
    newEvents: filteredNewEvents,
    goalPostEdits,
    injuryPostEdits,
    lineupPostAction,
  };
}

export default {
  EVENT_EMOJIS,
  formatEventPost,
  formatLineupPost,
  formatFixturesPost,
  compareMatchState,
};
