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
  MISSED_PENALTY: '❌',
  HALF_TIME: '⏱️',
  HALFTIME: '⏱️',
  SECOND_HALF: '🔄',
  FULL_TIME: '🏁',
  FULLTIME: '🏁',
};

/**
 * Converts a standard string to Unicode Mathematical Bold characters.
 * @param {string} str
 * @returns {string}
 */
export function makeUnicodeBold(str) {
  if (!str) return '';
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    // Uppercase A-Z (65-90) -> 1D400 (120064)
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(0x1D400 + (code - 65));
    }
    // Lowercase a-z (97-122) -> 1D41A (120090)
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint(0x1D41A + (code - 97));
    }
    // Digits 0-9 (48-57) -> 1D7CE (120782)
    if (code >= 48 && code <= 57) {
      return String.fromCodePoint(0x1D7CE + (code - 48));
    }
    return char;
  }).join('');
}

/**
 * Builds the Facebook post body for an in-game event.
 * @param {object} event
 * @param {object} currentMatch
 * @returns {string}
 */
export function formatEventPost(event, currentMatch) {
  const clock = event.minute ? `${event.minute}'` : currentMatch.status.clock || 'Live';
  const home = makeUnicodeBold(currentMatch.homeName);
  const away = makeUnicodeBold(currentMatch.awayName);
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
        detailLines.push(`🎯 Scorer: ${makeUnicodeBold(event.player)}`);
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
        detailLines.push(`🎯 Scorer: ${makeUnicodeBold(event.player)}`);
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
          detailLines.push(`🎯 Scorer: ${makeUnicodeBold(event.player)}`);
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
  const customHashtags = buildMatchHashtags(currentMatch.homeName, currentMatch.awayName, currentMatch.leagueName);
  const boldHeader = makeUnicodeBold(eventHeader);

  const sections = [
    `⚡ ${boldHeader} ⚡`,
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
  const homeBold = makeUnicodeBold(currentMatch.homeName.toUpperCase());
  const awayBold = makeUnicodeBold(currentMatch.awayName.toUpperCase());
  const homeSection = `${homeBold} startingXI; ${homeLineup.join(', ')}`;
  const awaySection = `${awayBold} startingXI; ${awayLineup.join(', ')}`;
  const hashtags = buildMatchHashtags(currentMatch.homeName, currentMatch.awayName, currentMatch.leagueName);
  const standardHashtags = '#StartingXI #Lineups #Football #Matchday #LineupNews';

  const heading = makeUnicodeBold("OFFICIAL STARTING LINEUPS ARE OUT!");
  const vsBoldLine = `💥 ${homeBold} 🆚 ${awayBold}`;

  return `🔥 ${heading} 📋⚽\n\n${vsBoldLine}\n━━━━━━━━━━━━━━━━━━━\n\n${homeSection}\n\n${awaySection}\n\n━━━━━━━━━━━━━━━━━━━\n👉 Who is winning this clash? Leave your predictions below! 👇\n\n${hashtags}\n${standardHashtags}`;
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

  const titleText = isYesterday ? 'RESULTS ARE IN!' : 'TODAY\'S FOOTBALL FIXTURES!';
  const titleEmoji = isYesterday ? `🏆 ${makeUnicodeBold(titleText)} ⚽🔥` : `🔥 ${makeUnicodeBold(titleText)} ⚽📅`;
  const subtitleEmoji = isYesterday ? `📅 ${makeUnicodeBold("Yesterday's Final Scores")}` : `📢 ${makeUnicodeBold("Don't miss any of the action!")}`;
  
  const lines = [
    `⚡ ${titleEmoji} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📅 Date: ${dateDisplay}`,
    `📢 ${subtitleEmoji}`,
    `🕐 All times are in West Africa Time (WAT)\n`,
  ];

  for (const [league, groupMatches] of Object.entries(grouped)) {
    lines.push(`🏆 ${makeUnicodeBold(league.toUpperCase())}\n`);
    groupMatches.forEach((m) => {
      const homeBold = makeUnicodeBold(m.homeName);
      const awayBold = makeUnicodeBold(m.awayName);
      if (isYesterday) {
        lines.push(`FT ${homeBold} ${m.score?.home ?? 0}-${m.score?.away ?? 0} ${awayBold}`);
      } else {
        lines.push(`${m.kickoffFormattedWAT || 'TBD'} ${homeBold} vs ${awayBold}`);
      }
    });
    lines.push('');
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore #ViralMatch #FootballFans';
  const callToAction = isYesterday
    ? '💬 What do you think about the scorelines? 👇'
    : '💬 Drop your predictions and thoughts thoughts below! 👇';
  lines.push(`━━━━━━━━━━━━━━━━━━━\n${callToAction}\n\n${standardHashtags}`);
  return lines.join('\n');
}

/**
 * Creates a deterministic, stable canonical ID for an event.
 * Format: {fixtureId}:{id} or {fixtureId}:{type}:{period}:{clock}:{team}
 * @param {object} ev
 * @param {string} fixtureId
 * @returns {string}
 */
export function getCanonicalEventId(ev, fixtureId) {
  if (ev.id) {
    return `${fixtureId}:${ev.id}`;
  }
  const type = (ev.type || 'EVENT').toUpperCase();
  const period = ev.period || 1;
  const clock = ev.minute !== undefined && ev.minute !== null ? ev.minute : (ev.clock || '0');
  
  if (type === 'GOAL') {
    const scoreKey = (ev.homeScore !== undefined && ev.awayScore !== undefined) ? `${ev.homeScore}-${ev.awayScore}` : 'score';
    return `${fixtureId}:${type}:${period}:${clock}:${scoreKey}`;
  }
  
  return `${fixtureId}:${type}:${period}:${clock}`;
}

/**
 * Builds a normalized signature of the event content to detect changes.
 * @param {object} ev
 * @returns {string}
 */
export function getEventContentSignature(ev) {
  const eventType = ev.type || '';
  const homeScore = ev.homeScore ?? '';
  const awayScore = ev.awayScore ?? '';
  const player = ev.player || '';
  const assist = ev.assist || '';
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : '';
  const description = ev.description || ev.text || '';
  return `${eventType}|${homeScore}-${awayScore}|${player}|${assist}|${minute}|${description}`;
}

/**
 * Core event comparator.
 * Compares current normalized match state against previous state stored in db.
 * Returns new events to publish and updates to existing posts.
 *
 * @param {any} prevRecord
 * @param {any} currentMatch
 * @returns {{ newEvents: any[], goalPostEdits: any[], injuryPostEdits: any[], lineupPostAction: 'PUBLISH'|'SKIP'|null, eventStates: Record<string, any> }}
 */
export function compareMatchState(prevRecord, currentMatch) {
  const fixtureId = currentMatch.fixtureId;
  const newEvents = [];
  const goalPostEdits = [];
  const injuryPostEdits = [];
  let lineupPostAction = null;

  // Initialize eventStates
  const eventStates = { ...(prevRecord?.eventStates || {}) };

  // Migrate legacy database structure if eventStates is empty but we have posted events
  if (Object.keys(eventStates).length === 0 && prevRecord?.postedEvents?.length > 0) {
    for (const sig of prevRecord.postedEvents) {
      const parts = sig.split(':');
      const type = parts[1] || 'EVENT';
      const minute = parseInt(parts[2], 10) || 0;
      const score = parts[3] || '0-0';
      const player = parts[4] || '';

      let canonicalId = sig;
      if (type === 'GOAL') {
        canonicalId = `${fixtureId}:GOAL:1:${minute}:${score}`;
      } else if (type === 'INJURY') {
        canonicalId = `${fixtureId}:INJURY:1:${minute}`;
      }

      eventStates[canonicalId] = {
        eventKey: canonicalId,
        eventType: type,
        facebookPostId: null,
        postedAt: new Date().toISOString(),
        lastContentSignature: `${type}|${score}|${player}||${minute}|`,
        status: 'POSTED'
      };
    }

    if (prevRecord.goalPosts) {
      for (const [goalKey, gp] of Object.entries(prevRecord.goalPosts)) {
        const [min, score] = goalKey.split(':');
        let matchedKey = Object.keys(eventStates).find(k => k.startsWith(`${fixtureId}:GOAL:`) && k.includes(`:${min}:`));
        if (!matchedKey) {
          matchedKey = `${fixtureId}:GOAL:1:${min}:${score || 'score'}`;
        }
        eventStates[matchedKey] = {
          eventKey: matchedKey,
          eventType: 'GOAL',
          facebookPostId: gp.postId,
          postedAt: new Date().toISOString(),
          lastContentSignature: `GOAL|${score || ''}|${gp.scorer || ''}|${gp.assist || ''}|${min}|`,
          status: 'POSTED'
        };
      }
    }

    if (prevRecord.injuryEvents) {
      for (const inj of prevRecord.injuryEvents) {
        let matchedKey = Object.keys(eventStates).find(k => k.startsWith(`${fixtureId}:INJURY:`) && k.includes(`:${inj.minute}`));
        if (!matchedKey) {
          matchedKey = `${fixtureId}:INJURY:1:${inj.minute}`;
        }
        eventStates[matchedKey] = {
          eventKey: matchedKey,
          eventType: 'INJURY',
          facebookPostId: inj.postId,
          postedAt: new Date().toISOString(),
          lastContentSignature: `INJURY|0-0|${inj.player || ''}||${inj.minute}|`,
          status: 'POSTED'
        };
      }
    }
  }

  // 1. HARD GATE: Lineup pre-kickoff publishing rule
  const lineupsAlreadyPosted = Boolean(prevRecord?.lineupsPosted);
  const isPreKickoff = currentMatch.status.state === 'pre';

  if (!lineupsAlreadyPosted) {
    if (isPreKickoff) {
      const hasHome = currentMatch.lineups?.home?.length >= 7;
      const hasAway = currentMatch.lineups?.away?.length >= 7;
      if (hasHome && hasAway) {
        lineupPostAction = 'PUBLISH';
      }
    } else {
      logger.info(`[LINEUP GATE] Match ${currentMatch.homeName} vs ${currentMatch.awayName} has kicked off (state=${currentMatch.status.state}). Lineup publishing permanently skipped.`);
      lineupPostAction = 'SKIP';
    }
  }

  // Gather all candidate events
  const candidateEvents = [];

  // 2. Lifecycle transitions: KICK-OFF
  const prevStatus = prevRecord?.lastStatus || 'pre';
  const currStatus = currentMatch.status.state;

  if (prevStatus === 'pre' && currStatus === 'in') {
    candidateEvents.push({
      type: 'KICKOFF',
      minute: 1,
      period: 1,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
      occurrenceTime: currentMatch.kickoff,
    });
  }

  // 3. Lifecycle: HALF-TIME
  if (
    currentMatch.status.description === 'Halftime' ||
    currentMatch.status.name === 'STATUS_HALFTIME'
  ) {
    candidateEvents.push({
      type: 'HALF_TIME',
      minute: 45,
      period: 1,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  // 4. Lifecycle: SECOND HALF
  if (prevRecord?.lastPeriod === 1 && currentMatch.status.period === 2) {
    candidateEvents.push({
      type: 'SECOND_HALF',
      minute: 46,
      period: 2,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  // 4b. Lifecycle: EXTRA TIME START
  if (prevRecord?.lastPeriod === 2 && currentMatch.status.period === 3) {
    candidateEvents.push({
      type: 'EXTRA_TIME_START',
      minute: 90,
      period: 3,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  // 4c. Lifecycle: EXTRA TIME HALF
  if (prevRecord?.lastPeriod === 3 && currentMatch.status.period === 4) {
    candidateEvents.push({
      type: 'EXTRA_TIME_HALF',
      minute: 105,
      period: 4,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  // 4d. Lifecycle: PENALTY SHOOTOUT
  if (prevRecord?.lastPeriod === 4 && currentMatch.status.period === 5) {
    candidateEvents.push({
      type: 'PENALTY_SHOOTOUT',
      minute: 120,
      period: 5,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  // 5. Lifecycle: FULL-TIME
  if (currStatus === 'post' && (currentMatch.status.period || 2) <= 2) {
    candidateEvents.push({
      type: 'FULL_TIME',
      minute: 90,
      period: 2,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  if (
    currStatus === 'in' &&
    currentMatch.status.period === 2 &&
    (currentMatch.status.description === 'Full Time' || currentMatch.status.detail?.toLowerCase().includes('full time'))
  ) {
    candidateEvents.push({
      type: 'FULL_TIME_PENDING_ET',
      minute: 90,
      period: 2,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  if (currStatus === 'post' && (currentMatch.status.period || 2) >= 3) {
    candidateEvents.push({
      type: 'FULL_TIME_POST_ET',
      minute: 120,
      period: 3,
      homeScore: currentMatch.score.home,
      awayScore: currentMatch.score.away,
      teamId: 'all',
    });
  }

  // 6. In-game events from match.events
  for (const ev of currentMatch.events || []) {
    if (ev.type === 'GOAL') {
      // Obtain latest reliable match score BEFORE doing anything else
      ev.homeScore = currentMatch.score.home;
      ev.awayScore = currentMatch.score.away;
    }
    candidateEvents.push(ev);
  }

  // 7. Evaluate each candidate event against the 3-state decision tree
  for (const ev of candidateEvents) {
    const eventKey = getCanonicalEventId(ev, fixtureId);
    const state = eventStates[eventKey];

    // State 1: EXPIRED/SKIPPED
    if (state?.status === 'EXPIRED') {
      continue;
    }

    // State 2: POSTED (already posted, checking for edits)
    if (state?.status === 'POSTED') {
      const currentSig = getEventContentSignature(ev);
      if (currentSig !== state.lastContentSignature) {
        if (ev.type === 'GOAL') {
          const goalKey = ev.goalKey || `${ev.minute}:${ev.homeScore}-${ev.awayScore}`;
          goalPostEdits.push({
            postId: state.facebookPostId,
            goalKey,
            event: ev,
            eventKey,
            newContentSig: currentSig
          });
        } else if (ev.type === 'INJURY') {
          injuryPostEdits.push({
            postId: state.facebookPostId,
            event: ev,
            eventKey,
            newContentSig: currentSig
          });
        }
      }
      continue;
    }

    // State 3: NEW
    const occurrenceTime = ev.occurrenceTime || new Date().toISOString();
    const eventTimestamp = new Date(occurrenceTime).getTime();
    const elapsedMs = Date.now() - eventTimestamp;

    const isEligible = config.isMockMode || (elapsedMs >= 0 && elapsedMs <= 300000);

    if (!isEligible) {
      logger.info(`[TIMING GATE] Skip event post for ${currentMatch.homeName} vs ${currentMatch.awayName} (${ev.type}): difference of ${(elapsedMs / 60000).toFixed(2)} minutes is outside the [0, 5] minutes allowed window.`);
      eventStates[eventKey] = {
        eventKey,
        eventType: ev.type,
        facebookPostId: null,
        postedAt: null,
        lastContentSignature: null,
        status: 'EXPIRED'
      };
      continue;
    }

    // Mark event for posting
    const goalKey = ev.type === 'GOAL' ? (ev.goalKey || `${ev.minute}:${ev.homeScore}-${ev.awayScore}`) : null;
    newEvents.push({
      ...ev,
      sig: eventKey, // use stable canonical ID as sig for backward compatibility
      eventKey,
      goalKey,
      contentSignature: getEventContentSignature(ev)
    });
  }

  return {
    newEvents,
    goalPostEdits,
    injuryPostEdits,
    lineupPostAction,
    eventStates
  };
}

export default {
  EVENT_EMOJIS,
  formatEventPost,
  formatLineupPost,
  formatFixturesPost,
  compareMatchState,
  getCanonicalEventId,
  getEventContentSignature,
};
