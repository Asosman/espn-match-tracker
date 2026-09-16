// services/eventEngine.js
import { buildMatchHashtags } from '../utils/hashtags.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

/**
 * Strict Event Whitelist
 * Only events explicitly listed in this set are permitted to generate Facebook posts.
 * Everything else (injuries, substitutions, yellow cards, generic status changes, etc.) is ignored.
 */
export const WHITELISTED_EVENT_TYPES = new Set([
  'LINEUP',
  'KICKOFF',
  'GOAL',
  'OWN_GOAL',
  'PENALTY_SCORED',
  'RED_CARD',
  'GOAL_DISALLOWED',
  'HALF_TIME',
  'FULL_TIME',
  'EXTRA_TIME',
  'AFTER_EXTRA_TIME_OR_SHOOTOUT',
]);

/**
 * Checks whether an event qualifies under the strict event whitelist.
 * @param {object} ev
 * @returns {boolean}
 */
export function isWhitelistedEvent(ev) {
  if (!ev || !ev.type) return false;
  // Penalty shootouts are post-match tiebreakers. Shootout kicks are NEVER match goals or in-game penalties.
  if (ev.period === 5 || ev.isShootout || ev.shootoutPlay) {
    return false;
  }
  const text = (ev.text || ev.description || '').toLowerCase();
  if (text.includes('penalty shootout') || /\b\d+\s*\(\d+\)/.test(text)) {
    return false;
  }
  const type = ev.type.toUpperCase();
  if (WHITELISTED_EVENT_TYPES.has(type)) return true;
  if (type === 'OWN_GOAL') return true;
  if (type === 'HALFTIME' || type === 'HALF_TIME') return true;
  if (type === 'FULLTIME' || type === 'FULL_TIME' || type === 'FULL_TIME_PENDING_ET') return true;
  if (type === 'EXTRA_TIME_START' || type === 'EXTRA_TIME') return true;
  if (type === 'FULL_TIME_POST_ET' || type === 'AFTER_EXTRA_TIME_OR_SHOOTOUT') return true;
  return false;
}

export const EVENT_EMOJIS = {
  LINEUP: '📋',
  KICKOFF: '🟢',
  GOAL: '⚽',
  OWN_GOAL: '😱',
  PENALTY_SCORED: '🥅',
  RED_CARD: '🟥',
  GOAL_DISALLOWED: '🚨',
  HALF_TIME: '⏱️',
  FULL_TIME: '🏁',
  EXTRA_TIME: '⏱️',
  AFTER_EXTRA_TIME_OR_SHOOTOUT: '🏆',
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
 * Parses goal scoreline directly from commentary or play text.
 * E.g. "Goal! Platense 1, Fluminense 0. Guido Mainero (Platense)..." -> { home: 1, away: 0 }
 * @param {string} text
 * @param {string} homeName
 * @param {string} awayName
 * @returns {{ home: number, away: number } | null}
 */
export function parseGoalScoreFromText(text, homeName, awayName) {
  if (!text) return null;
  const hLower = (homeName || '').toLowerCase().trim();
  const aLower = (awayName || '').toLowerCase().trim();

  // Pattern 1: Team names with score e.g. "Arsenal 1, Chelsea 0" or "Goal! Arsenal 1, Chelsea 0." or "Own Goal by Sven Botman, Newcastle United. Manchester United 1, Newcastle United 0."
  const p1 = text.match(/(?:Goal!.*?\b|Own\s*Goal.*?\b|\b)([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+)/i);
  if (p1) {
    const t1 = p1[1].trim().toLowerCase();
    const s1 = parseInt(p1[2], 10);
    const t2 = p1[3].trim().toLowerCase();
    const s2 = parseInt(p1[4], 10);

    if ((hLower && (t1.includes(hLower) || hLower.includes(t1))) || (aLower && (t2.includes(aLower) || aLower.includes(t2)))) {
      return { home: s1, away: s2 };
    } else if ((aLower && (t1.includes(aLower) || aLower.includes(t1))) || (hLower && (t2.includes(hLower) || hLower.includes(t2)))) {
      return { home: s2, away: s1 };
    }
    return { home: s1, away: s2 };
  }

  // Pattern 2: Scoreline in text e.g. "1-0" or "(1 - 0)" or "1–0"
  const p2 = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (p2) {
    return { home: parseInt(p2[1], 10), away: parseInt(p2[2], 10) };
  }

  return null;
}

/**
 * Determines whether the home or away team scored based on multiple attributes:
 * teamId, teamName, commentary text parenthetical team, and lineups.
 * @param {object} ev
 * @param {object} currentMatch
 * @returns {'home' | 'away' | null}
 */
export function detectScoringTeam(ev, currentMatch) {
  const homeName = (currentMatch.homeName || currentMatch.homeTeam || '').toLowerCase().trim();
  const awayName = (currentMatch.awayName || currentMatch.awayTeam || '').toLowerCase().trim();
  const homeId = String(currentMatch.homeId || currentMatch.raw?.homeId || '').toLowerCase().trim();
  const awayId = String(currentMatch.awayId || currentMatch.raw?.awayId || '').toLowerCase().trim();

  const evTeamId = String(ev.teamId || '').toLowerCase().trim();
  const evTeamName = String(ev.teamName || ev.team || '').toLowerCase().trim();
  const player = String(ev.player || '').toLowerCase().trim();
  const text = String(ev.text || ev.description || '').toLowerCase();

  // 1. By Team ID
  if (homeId && evTeamId === homeId) return 'home';
  if (awayId && evTeamId === awayId) return 'away';
  if (evTeamId === 'home') return 'home';
  if (evTeamId === 'away') return 'away';

  // 2. By Team Name
  if (evTeamName) {
    if (homeName && (evTeamName.includes(homeName) || homeName.includes(evTeamName))) return 'home';
    if (awayName && (evTeamName.includes(awayName) || awayName.includes(evTeamName))) return 'away';
  }

  // 3. By Team in parentheses in commentary text e.g. "Guido Mainero (Platense)"
  const parenMatch = (ev.text || '').match(/\(([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\)/);
  if (parenMatch) {
    const pTeam = parenMatch[1].toLowerCase().trim();
    if (homeName && (pTeam.includes(homeName) || homeName.includes(pTeam))) return 'home';
    if (awayName && (pTeam.includes(awayName) || awayName.includes(pTeam))) return 'away';
  }

  // 4. By Player in Lineups / Rosters
  if (player) {
    const inHome = (currentMatch.lineups?.home || []).some((p) => {
      const pl = String(p).toLowerCase();
      return pl.includes(player) || player.includes(pl);
    });
    if (inHome) return 'home';

    const inAway = (currentMatch.lineups?.away || []).some((p) => {
      const pl = String(p).toLowerCase();
      return pl.includes(player) || player.includes(pl);
    });
    if (inAway) return 'away';
  }

  // 5. Team name mentioned in free text
  if (homeName && text.includes(homeName) && (!awayName || !text.includes(awayName))) return 'home';
  if (awayName && text.includes(awayName) && (!homeName || !text.includes(homeName))) return 'away';

  return null;
}

/**
 * Builds the Facebook post body for an allowed in-game event.
 * @param {object} event
 * @param {object} currentMatch
 * @returns {string}
 */
export function formatEventPost(event, currentMatch) {
  const clock = event.minute !== undefined && event.minute !== null ? `${event.minute}'` : (currentMatch.status?.clock || 'Live');
  const home = makeUnicodeBold(currentMatch.homeName || currentMatch.homeTeam || 'Home');
  const away = makeUnicodeBold(currentMatch.awayName || currentMatch.awayTeam || 'Away');
  
  // CRITICAL SCORE RULE:
  // Each goal event must preserve the score immediately after THAT event.
  // NEVER replace historical event scores with the current match score!
  let homeScore = event.scoreAfterEvent?.home ?? event.homeScore ?? (currentMatch.score?.home ?? 0);
  let awayScore = event.scoreAfterEvent?.away ?? event.awayScore ?? (currentMatch.score?.away ?? 0);

  const type = (event.type || '').toUpperCase();

  // CRITICAL SAFEGUARD: A goal, own goal, or penalty scored event can NEVER display 0 - 0!
  if ((type === 'GOAL' || type === 'OWN_GOAL' || type === 'PENALTY_SCORED') && (event.status !== 'DISALLOWED' && !event.isDisallowed) && homeScore === 0 && awayScore === 0) {
    if (currentMatch.score && (currentMatch.score.home > 0 || currentMatch.score.away > 0)) {
      homeScore = currentMatch.score.home;
      awayScore = currentMatch.score.away;
    } else {
      const parsed = parseGoalScoreFromText(event.text || event.description, currentMatch.homeName, currentMatch.awayName);
      if (parsed && (parsed.home > 0 || parsed.away > 0)) {
        homeScore = parsed.home;
        awayScore = parsed.away;
      } else {
        const scoringTeam = detectScoringTeam(event, currentMatch);
        const isOwnGoal = Boolean(event.ownGoal || type === 'OWN_GOAL');
        if (scoringTeam === 'away') {
          if (isOwnGoal) {
            homeScore = 1;
          } else {
            awayScore = 1;
          }
        } else {
          if (isOwnGoal) {
            awayScore = 1;
          } else {
            homeScore = 1;
          }
        }
      }
    }
  }

  let eventHeader = '📢 MATCH EVENT!';
  let eventLine = '';
  const detailLines = [];

  switch (type) {
    case 'KICKOFF':
      eventHeader = '🟢 KICK-OFF! WE ARE UNDERWAY! 🔥';
      eventLine = '🟢 Kick-off! The match has officially started!';
      break;

    case 'OWN_GOAL':
      eventHeader = '😱 𝐎𝐖𝐍 𝐆𝐎𝐀𝐋! 🤦‍♂️📉';
      eventLine = '😱 Disastrous moment! The ball is turned into the back of their own net!';
      if (event.player) {
        const teamSuffix = event.teamName ? ` (${event.teamName})` : '';
        detailLines.push(`🤦‍♂️ Own Goal: ${makeUnicodeBold(event.player)}${teamSuffix}`);
      }
      break;

    case 'GOAL':
      if (event.status === 'DISALLOWED' || event.isDisallowed) {
        eventHeader = '🚨 GOAL DISALLOWED! VAR DECISION! 📺❌';
        eventLine = '❌ Goal officially ruled out after VAR review!';
        if (event.player) {
          detailLines.push(`👤 Player: ${makeUnicodeBold(event.player)}`);
        }
        if (event.disallowedReason || event.reason) {
          detailLines.push(`📝 Reason: ${event.disallowedReason || event.reason}`);
        }
        break;
      }
      if (event.ownGoal) {
        eventHeader = '😱 𝐎𝐖𝐍 𝐆𝐎𝐀𝐋! 🤦‍♂️📉';
        eventLine = '😱 Disastrous moment! The ball is turned into the back of their own net!';
        if (event.player) {
          const teamSuffix = event.teamName ? ` (${event.teamName})` : '';
          detailLines.push(`🤦‍♂️ Own Goal: ${makeUnicodeBold(event.player)}${teamSuffix}`);
        }
        break;
      }
      eventHeader = '🔥 GOOOOALLLLL! ⚽💥';
      eventLine = '⚽ GOAL! Back of the net!';
      if (event.player) {
        detailLines.push(`🎯 Scorer: ${makeUnicodeBold(event.player)}`);
      }
      if (event.assist) {
        detailLines.push(`🪄 Assist: ${event.assist} 🅰️`);
      }
      break;

    case 'PENALTY_SCORED':
      eventHeader = '⚽ PENALTY SCORED! ICE COLD! 🥶🥅';
      eventLine = '🥅 Penalty converted successfully!';
      if (event.player) {
        detailLines.push(`🎯 Scorer: ${makeUnicodeBold(event.player)} (Penalty)`);
      }
      if (event.assist) {
        detailLines.push(`🪄 Assist: ${event.assist} 🅰️`);
      }
      break;

    case 'RED_CARD':
      eventHeader = '🟥 RED CARD! DRAMA IN THE MATCH! 🤯';
      eventLine = event.isSecondYellow ? '🟨🟥 Red Card (Second Yellow Dismissal)!' : '🟥 Straight Red Card Dismissal!';
      if (event.player) {
        detailLines.push(`👤 Player Dismissed: ${makeUnicodeBold(event.player)} 🚶‍♂️`);
      }
      break;

    case 'GOAL_DISALLOWED':
      eventHeader = '🚨 GOAL DISALLOWED! VAR INTERVENTION! 📺';
      eventLine = '🚨 Goal officially disallowed by the referee!';
      if (event.player) {
        detailLines.push(`👤 Player / Team: ${event.player}`);
      }
      if (event.reason || event.text) {
        detailLines.push(`📝 Reason: ${event.reason || event.text}`);
      }
      break;

    case 'HALF_TIME':
    case 'HALFTIME':
      eventHeader = '⏱️ HALF-TIME WHISTLE! ⏸️';
      eventLine = `⏱️ First half has officially ended. (HT Score: ${homeScore} - ${awayScore})`;
      break;

    case 'FULL_TIME':
    case 'FULLTIME':
    case 'FULL_TIME_PENDING_ET':
      eventHeader = '🏁 FULL-TIME! 90 MINUTES COMPLETE! 🏆';
      eventLine = `🏁 The normal 90-minute match has ended. (Score: ${homeScore} - ${awayScore})`;
      break;

    case 'EXTRA_TIME':
    case 'EXTRA_TIME_START':
      eventHeader = '⏱️ EXTRA TIME UNDERWAY! ⚔️🔥';
      eventLine = '⏱️ Extra time has officially begun! 30 additional minutes of play underway!';
      break;

    case 'AFTER_EXTRA_TIME_OR_SHOOTOUT':
    case 'FULL_TIME_POST_ET': {
      const shootout = currentMatch.shootout || event.shootout;
      if (shootout && shootout.home !== undefined && shootout.away !== undefined) {
        eventHeader = '🏆 MATCH DECIDED ON PENALTIES! FINAL RESULT! 🧤⚽';
        eventLine = `🏁 Final whistle after extra time and penalty shootout!`;
        detailLines.push(`⏱️ Score after Extra Time: ${home} ${homeScore} - ${awayScore} ${away}`);
        detailLines.push(`🥅 Penalty Shootout: ${home} ${shootout.home} - ${shootout.away} ${away}`);
      } else {
        eventHeader = '🏁 FINAL WHISTLE AFTER EXTRA TIME! 🏆🔥';
        eventLine = `🏁 Match finished after extra time! (Final score: ${homeScore} - ${awayScore})`;
      }
      break;
    }

    default:
      // Fallback for any other event
      eventHeader = `📢 MATCH EVENT: ${type}`;
      eventLine = `📢 Event officially recorded.`;
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
    : '💬 Drop your predictions and thoughts below! 👇';
  lines.push(`━━━━━━━━━━━━━━━━━━━\n${callToAction}\n\n${standardHashtags}`);
  return lines.join('\n');
}

/**
 * Creates a deterministic, stable canonical ID for an event.
 * Strictly NEVER uses match score as an event identity.
 * @param {object} ev
 * @param {string} fixtureId
 * @param {number} [occurrenceIndex=0]
 * @returns {string}
 */
export function getCanonicalEventId(ev, fixtureId, occurrenceIndex = 0) {
  const type = (ev.type || 'EVENT').toUpperCase();

  // 1. Kickoff: exactly one per match
  if (type === 'KICKOFF') {
    return `${fixtureId}:KICKOFF`;
  }

  // 2. Half-time: exactly one per match
  if (type === 'HALF_TIME' || type === 'HALFTIME') {
    return `${fixtureId}:HALF_TIME`;
  }

  // 3. Full-time (normal 90 mins): exactly one per match
  if (type === 'FULL_TIME' || type === 'FULLTIME' || type === 'FULL_TIME_PENDING_ET') {
    return `${fixtureId}:FULL_TIME`;
  }

  // 4. Extra-time start: exactly one per match
  if (type === 'EXTRA_TIME' || type === 'EXTRA_TIME_START') {
    return `${fixtureId}:EXTRA_TIME`;
  }

  // 5. After extra-time / shootout: exactly one per match
  if (type === 'AFTER_EXTRA_TIME_OR_SHOOTOUT' || type === 'FULL_TIME_POST_ET') {
    return `${fixtureId}:AFTER_EXTRA_TIME_OR_SHOOTOUT`;
  }

  // 6. Lineups: exactly one per match
  if (type === 'LINEUP') {
    return `${fixtureId}:LINEUP`;
  }

  // 7. Stable ESPN ID when provided by feed
  if (ev.id) {
    return `${fixtureId}:${type}:${ev.id}`;
  }

  // 8. Deterministic fallback using stable attributes (period, minute, teamId, occurrence)
  // NEVER include current match score in event identity!
  const period = ev.period || 1;
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : (ev.clock || '0');
  const teamId = ev.teamId ? String(ev.teamId).toLowerCase().trim() : 'team';
  return `${fixtureId}:${type}:p${period}:m${minute}:t${teamId}:idx${occurrenceIndex}`;
}

/**
 * Builds a normalized signature of the event content to detect substantive changes.
 * Uses event scoreAfterEvent, NOT the mutable current match score.
 * @param {object} ev
 * @returns {string}
 */
export function getEventContentSignature(ev) {
  const eventType = (ev.type || '').toUpperCase();
  const homeScore = ev.scoreAfterEvent?.home ?? ev.homeScore ?? '';
  const awayScore = ev.scoreAfterEvent?.away ?? ev.awayScore ?? '';
  const player = (ev.player || '').trim();
  const assist = (ev.assist || '').trim();
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : '';
  const status = ev.status || 'VALID';
  const description = ev.description || ev.text || '';
  return `${eventType}|${homeScore}-${awayScore}|${player}|${assist}|${minute}|${status}|${description}`;
}

/**
 * Core event comparator with strict whitelist filtering and canonical state management.
 * Compares current normalized match state against previous canonical state stored in db.
 * Returns only whitelisted new events to publish and updates to existing posts.
 *
 * @param {any} prevRecord
 * @param {any} currentMatch
 * @returns {{
 *   newEvents: any[],
 *   goalPostEdits: any[],
 *   eventPostEdits: any[],
 *   injuryPostEdits: any[],
 *   lineupPostAction: 'PUBLISH'|'SKIP'|null,
 *   events: Record<string, any>,
 *   facebookPosts: Record<string, any>,
 *   eventStates: Record<string, any>
 * }}
 */
export function compareMatchState(prevRecord, currentMatch) {
  const fixtureId = String(currentMatch.fixtureId || currentMatch.matchId);
  const newEvents = [];
  const goalPostEdits = [];
  const eventPostEdits = [];
  const injuryPostEdits = [];
  let lineupPostAction = null;

  // 1. Initialize Canonical Events and Facebook Posts maps
  const canonicalEvents = { ...(prevRecord?.events || {}) };
  const facebookPosts = { ...(prevRecord?.facebookPosts || {}) };

  // Migrate legacy eventStates or postedEvents if events is empty
  if (Object.keys(canonicalEvents).length === 0) {
    if (prevRecord?.eventStates && Object.keys(prevRecord.eventStates).length > 0) {
      for (const [key, state] of Object.entries(prevRecord.eventStates)) {
        canonicalEvents[key] = {
          eventId: key,
          type: state.eventType || 'EVENT',
          status: state.status || 'VALID',
          facebookPostId: state.facebookPostId || null,
          postedAt: state.postedAt || new Date().toISOString(),
          lastContentSignature: state.lastContentSignature || '',
          scoreAfterEvent: state.scoreAfterEvent || prevRecord.lastScore || { home: 0, away: 0 },
        };
        if (state.facebookPostId) {
          facebookPosts[state.facebookPostId] = {
            postId: state.facebookPostId,
            eventId: key,
            type: state.eventType,
            createdAt: state.postedAt,
          };
        }
      }
    } else if (prevRecord?.postedEvents?.length > 0) {
      for (const sig of prevRecord.postedEvents) {
        canonicalEvents[sig] = {
          eventId: sig,
          type: sig.split(':')[1] || 'EVENT',
          status: 'VALID',
          facebookPostId: null,
          postedAt: new Date().toISOString(),
          lastContentSignature: sig,
          scoreAfterEvent: prevRecord.lastScore || { home: 0, away: 0 },
        };
      }
    }
  }

  // 2. HARD GATE: LINEUP pre-kickoff publishing rule
  const lineupsAlreadyPosted = Boolean(prevRecord?.lineupsPosted);
  const isPreKickoff = currentMatch.status?.state === 'pre';

  if (!lineupsAlreadyPosted) {
    if (isPreKickoff) {
      const hasHome = currentMatch.lineups?.home?.length >= 7;
      const hasAway = currentMatch.lineups?.away?.length >= 7;
      if (hasHome && hasAway) {
        lineupPostAction = 'PUBLISH';
      }
    } else {
      logger.info(`[LINEUP GATE] Match ${currentMatch.homeName} vs ${currentMatch.awayName} has kicked off (state=${currentMatch.status?.state}). Lineup publishing permanently skipped.`);
      lineupPostAction = 'SKIP';
    }
  }

  // 3. Gather candidate events
  const candidateEvents = [];

  // Lifecycle: KICK-OFF
  const prevStatus = prevRecord?.status?.state || prevRecord?.lastStatus || 'pre';
  const currStatus = currentMatch.status?.state || 'pre';

  if (prevStatus === 'pre' && currStatus === 'in') {
    candidateEvents.push({
      type: 'KICKOFF',
      minute: 1,
      period: 1,
      homeScore: 0,
      awayScore: 0,
      scoreAfterEvent: { home: 0, away: 0 },
      teamId: 'all',
      occurrenceTime: currentMatch.kickoff,
    });
  }

  // Lifecycle: HALF-TIME
  if (
    currentMatch.status?.description === 'Halftime' ||
    currentMatch.status?.name === 'STATUS_HALFTIME' ||
    currentMatch.status?.detail?.toLowerCase().includes('halftime')
  ) {
    candidateEvents.push({
      type: 'HALF_TIME',
      minute: 45,
      period: 1,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // Lifecycle: EXTRA TIME START
  const prevPeriod = prevRecord?.status?.period ?? prevRecord?.lastPeriod ?? 0;
  const currPeriod = currentMatch.status?.period ?? 0;
  if (
    (prevPeriod === 2 && currPeriod === 3) ||
    (currPeriod === 3 && prevStatus === 'in' && !canonicalEvents[`${fixtureId}:EXTRA_TIME`])
  ) {
    candidateEvents.push({
      type: 'EXTRA_TIME',
      minute: 90,
      period: 3,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // Lifecycle: FULL-TIME in normal 90 mins
  if (currStatus === 'post' && currPeriod <= 2) {
    candidateEvents.push({
      type: 'FULL_TIME',
      minute: 90,
      period: 2,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // Lifecycle: AFTER EXTRA TIME / SHOOTOUT SCORELINE
  if (currStatus === 'post' && currPeriod >= 3) {
    candidateEvents.push({
      type: 'AFTER_EXTRA_TIME_OR_SHOOTOUT',
      minute: 120,
      period: currPeriod || 5,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      shootout: currentMatch.shootout || null,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // In-game events from currentMatch.events (with strict whitelist filtering)
  for (const rawEv of currentMatch.events || []) {
    let ev = { ...rawEv };

    // Standardize aliases
    if (ev.type === 'HALFTIME') ev.type = 'HALF_TIME';
    if (ev.type === 'FULLTIME') ev.type = 'FULL_TIME';
    if (ev.type === 'EXTRA_TIME_START') ev.type = 'EXTRA_TIME';
    if (ev.type === 'FULL_TIME_POST_ET') ev.type = 'AFTER_EXTRA_TIME_OR_SHOOTOUT';

    // Handle VAR events: only allowed if directly resulting in a disallowed goal
    if (ev.type === 'VAR') {
      const text = (ev.text || ev.description || '').toLowerCase();
      if (text.includes('disallowed') || text.includes('no goal') || text.includes('overturned')) {
        ev.type = 'GOAL_DISALLOWED';
        ev.reason = ev.text || ev.description;
      } else {
        continue;
      }
    }

    // Handle Penalty events: only PENALTY_SCORED is allowed
    if (ev.type === 'PENALTY') {
      if (ev.outcome === 'SCORED') {
        ev.type = 'PENALTY_SCORED';
      } else {
        continue;
      }
    }

    // Strict Whitelist Gate
    if (!isWhitelistedEvent(ev)) {
      continue;
    }

    candidateEvents.push(ev);
  }

  // Track occurrence count for deterministic IDs without score
  const occurrenceTracker = new Map();

  // 4. Process each candidate event against canonical state
  for (const ev of candidateEvents) {
    if (!isWhitelistedEvent(ev)) continue;

    const type = (ev.type || '').toUpperCase();
    const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : 0;
    const period = ev.period || 1;
    const teamId = ev.teamId ? String(ev.teamId).toLowerCase().trim() : 'team';
    const occKey = `${type}:${period}:${minute}:${teamId}`;
    const occIndex = occurrenceTracker.get(occKey) || 0;
    occurrenceTracker.set(occKey, occIndex + 1);

    const generatedEventId = getCanonicalEventId(ev, fixtureId, occIndex);

    // Find if event already exists in canonical match state
    let matchedEvent = canonicalEvents[generatedEventId];

    if (!matchedEvent) {
      // Secondary lookup: by raw ESPN ID
      if (ev.id) {
        matchedEvent = Object.values(canonicalEvents).find((e) => e.rawId === String(ev.id));
      }
      // Tertiary lookup: by exact (type, period, minute, teamId, occurrence)
      if (!matchedEvent) {
        matchedEvent = Object.values(canonicalEvents).find(
          (e) => (e.type === type || ((type === 'GOAL' || type === 'OWN_GOAL') && (e.type === 'GOAL' || e.type === 'OWN_GOAL'))) &&
                 e.period === period && e.minute === minute && (!e.teamId || e.teamId === teamId)
        );
      }
    }

    // CASE A: EXISTING EVENT
    if (matchedEvent) {
      // If event was previously disallowed or cancelled, ignore
      if (matchedEvent.status === 'DISALLOWED' || matchedEvent.status === 'REVERSED' || matchedEvent.status === 'CANCELLED') {
        continue;
      }

      // Check if this candidate is a VAR disallow of the existing event
      if (ev.type === 'GOAL_DISALLOWED' || ev.disallowed === true) {
        logger.info(`[GOAL DISALLOWED] Goal ${matchedEvent.eventId} is officially disallowed.`);
        matchedEvent.status = 'DISALLOWED';
        matchedEvent.disallowedReason = ev.reason || ev.text || 'Disallowed by referee/VAR';
        matchedEvent.lastContentSignature = getEventContentSignature(matchedEvent);

        if (matchedEvent.facebookPostId) {
          const editPayload = {
            postId: matchedEvent.facebookPostId,
            event: matchedEvent,
            eventId: matchedEvent.eventId,
            eventKey: matchedEvent.eventId,
            goalKey: matchedEvent.goalKey,
            newContentSig: matchedEvent.lastContentSignature,
            isDisallowed: true,
          };
          goalPostEdits.push(editPayload);
          eventPostEdits.push(editPayload);
        }
        continue;
      }

      // Check for newly arrived substantive info (scorer, assist, player on red card, own goal)
      let contentChanged = false;
      const prevSig = matchedEvent.lastContentSignature || '';

      if (ev.player && !matchedEvent.player) {
        matchedEvent.player = ev.player;
        contentChanged = true;
      } else if (ev.player && matchedEvent.player !== ev.player) {
        matchedEvent.player = ev.player;
        contentChanged = true;
      }

      if ((ev.ownGoal || type === 'OWN_GOAL') && !matchedEvent.ownGoal) {
        matchedEvent.ownGoal = true;
        matchedEvent.type = 'OWN_GOAL';
        contentChanged = true;
      }

      if (ev.assist && !matchedEvent.assist) {
        matchedEvent.assist = ev.assist;
        contentChanged = true;
      }

      // Check if an existing goal was previously saved with an un-updated score (0-0)
      if ((matchedEvent.type === 'GOAL' || matchedEvent.type === 'OWN_GOAL' || matchedEvent.type === 'PENALTY_SCORED') &&
          matchedEvent.status !== 'DISALLOWED' &&
          matchedEvent.scoreAfterEvent?.home === 0 &&
          matchedEvent.scoreAfterEvent?.away === 0) {
        let correctedScore = null;
        if (ev.scoreAfterEvent && (ev.scoreAfterEvent.home > 0 || ev.scoreAfterEvent.away > 0)) {
          correctedScore = { ...ev.scoreAfterEvent };
        } else {
          const textScore = parseGoalScoreFromText(ev.text || matchedEvent.text || matchedEvent.description, currentMatch.homeName, currentMatch.awayName);
          if (textScore && (textScore.home > 0 || textScore.away > 0)) {
            correctedScore = textScore;
          } else if (currentMatch.score && (currentMatch.score.home > 0 || currentMatch.score.away > 0)) {
            correctedScore = { home: currentMatch.score.home, away: currentMatch.score.away };
          } else {
            const scoringTeam = detectScoringTeam(ev, currentMatch) || detectScoringTeam(matchedEvent, currentMatch);
            const isOg = Boolean(matchedEvent.ownGoal || ev.ownGoal || matchedEvent.type === 'OWN_GOAL');
            if (scoringTeam === 'away') {
              correctedScore = isOg ? { home: 1, away: 0 } : { home: 0, away: 1 };
            } else {
              correctedScore = isOg ? { home: 0, away: 1 } : { home: 1, away: 0 };
            }
          }
        }
        if (correctedScore && (correctedScore.home > 0 || correctedScore.away > 0)) {
          logger.info(`[SCORE CORRECTION] Correcting 0-0 score for goal ${matchedEvent.eventId} to ${correctedScore.home}-${correctedScore.away}`);
          matchedEvent.scoreAfterEvent = correctedScore;
          matchedEvent.homeScore = correctedScore.home;
          matchedEvent.awayScore = correctedScore.away;
          contentChanged = true;
        }
      }

      if (contentChanged) {
        const newSig = getEventContentSignature(matchedEvent);
        matchedEvent.lastContentSignature = newSig;

        if (matchedEvent.facebookPostId) {
          logger.info(`[EVENT UPDATE] Queueing update for Facebook post ${matchedEvent.facebookPostId} (${matchedEvent.eventId}) with newly resolved details.`);
          const editPayload = {
            postId: matchedEvent.facebookPostId,
            event: { ...matchedEvent }, // strictly preserves matchedEvent.scoreAfterEvent!
            eventId: matchedEvent.eventId,
            eventKey: matchedEvent.eventId,
            goalKey: matchedEvent.goalKey,
            newContentSig: newSig,
          };
          goalPostEdits.push(editPayload);
          eventPostEdits.push(editPayload);
        }
      }
      continue;
    }

    // CASE B: NEW EVENT
    // Determine scoreAfterEvent for this new event
    let scoreAfterEvent = null;
    if (type === 'GOAL' || type === 'PENALTY_SCORED' || type === 'OWN_GOAL') {
      const prevHome = prevRecord?.score?.home ?? prevRecord?.lastScore?.home ?? 0;
      const prevAway = prevRecord?.score?.away ?? prevRecord?.lastScore?.away ?? 0;
      const prevTotal = prevHome + prevAway;

      // 1. Parse score from commentary/play text (e.g. "Goal! Arsenal 1, Chelsea 1.")
      const textScore = parseGoalScoreFromText(ev.text || ev.description, currentMatch.homeName, currentMatch.awayName);

      if (textScore && (textScore.home + textScore.away > prevTotal)) {
        scoreAfterEvent = textScore;
      } else if (ev.scoreAfterEvent && (ev.scoreAfterEvent.home + ev.scoreAfterEvent.away > prevTotal)) {
        scoreAfterEvent = { ...ev.scoreAfterEvent };
      } else if (ev.homeScore !== undefined && ev.homeScore !== null && ev.awayScore !== undefined && ev.awayScore !== null && (ev.homeScore + ev.awayScore > prevTotal)) {
        scoreAfterEvent = { home: parseInt(ev.homeScore, 10), away: parseInt(ev.awayScore, 10) };
      } else if (currentMatch.score && (currentMatch.score.home + currentMatch.score.away > prevTotal)) {
        // Live match header score already incremented
        scoreAfterEvent = { home: currentMatch.score.home, away: currentMatch.score.away };
      } else {
        // 2. Score in feed has not incremented yet: determine scoring team and calculate directly!
        const scoringTeam = detectScoringTeam(ev, currentMatch);
        const isOwnGoal = Boolean(ev.ownGoal || type === 'OWN_GOAL');

        if (scoringTeam === 'home') {
          scoreAfterEvent = isOwnGoal
            ? { home: prevHome, away: prevAway + 1 }
            : { home: prevHome + 1, away: prevAway };
        } else if (scoringTeam === 'away') {
          scoreAfterEvent = isOwnGoal
            ? { home: prevHome + 1, away: prevAway }
            : { home: prevHome, away: prevAway + 1 };
        } else if (currentMatch.score && (currentMatch.score.home > 0 || currentMatch.score.away > 0)) {
          scoreAfterEvent = { home: currentMatch.score.home, away: currentMatch.score.away };
        } else {
          // Absolute fallback: a goal cannot leave score unchanged
          scoreAfterEvent = isOwnGoal
            ? { home: prevHome, away: prevAway + 1 }
            : { home: prevHome + 1, away: prevAway };
        }
      }

      // Sync currentMatch.score immediately so match record reflects the new scoreline
      if (scoreAfterEvent && (scoreAfterEvent.home + scoreAfterEvent.away > (currentMatch.score?.home || 0) + (currentMatch.score?.away || 0))) {
        currentMatch.score = { home: scoreAfterEvent.home, away: scoreAfterEvent.away };
      }
    } else if (ev.scoreAfterEvent) {
      scoreAfterEvent = { ...ev.scoreAfterEvent };
    } else if (ev.homeScore !== undefined && ev.homeScore !== null && ev.awayScore !== undefined && ev.awayScore !== null) {
      scoreAfterEvent = { home: parseInt(ev.homeScore, 10), away: parseInt(ev.awayScore, 10) };
    } else {
      scoreAfterEvent = { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 };
    }

    // Check timing gate (5 min window or mock mode)
    const occurrenceTime = ev.occurrenceTime || new Date().toISOString();
    const eventTimestamp = new Date(occurrenceTime).getTime();
    const elapsedMs = Date.now() - eventTimestamp;
    const isEligible = config.isMockMode || (elapsedMs >= 0 && elapsedMs <= 300000);

    const eventId = generatedEventId;
    const goalKey = (type === 'GOAL' || type === 'PENALTY_SCORED' || type === 'OWN_GOAL')
      ? `${minute}:p${period}:${teamId}:${occIndex}`
      : null;

    if (!isEligible) {
      logger.info(`[TIMING GATE] Skip event post for ${currentMatch.homeName} vs ${currentMatch.awayName} (${type}): outside [0, 5] minutes window.`);
      canonicalEvents[eventId] = {
        eventId,
        eventKey: eventId,
        rawId: ev.id || null,
        type,
        minute,
        period,
        teamId: ev.teamId || null,
        player: ev.player || null,
        assist: ev.assist || null,
        scoreAfterEvent,
        status: 'EXPIRED',
        facebookPostId: null,
        postedAt: null,
        lastContentSignature: null,
      };
      continue;
    }

    const newRecord = {
      eventId,
      eventKey: eventId,
      rawId: ev.id ? String(ev.id) : null,
      type,
      minute,
      period,
      teamId: ev.teamId || null,
      player: ev.player || null,
      assist: ev.assist || null,
      scoreAfterEvent,
      homeScore: scoreAfterEvent.home,
      awayScore: scoreAfterEvent.away,
      ownGoal: Boolean(ev.ownGoal || type === 'OWN_GOAL'),
      isSecondYellow: Boolean(ev.isSecondYellow),
      description: ev.description || ev.text || '',
      text: ev.text || '',
      reason: ev.reason || '',
      status: 'PENDING',
      facebookPostId: null,
      postedAt: null,
      occurrenceTime,
      goalKey,
      lastContentSignature: getEventContentSignature({ ...ev, scoreAfterEvent, status: 'PENDING' }),
    };

    canonicalEvents[eventId] = newRecord;

    newEvents.push({
      ...newRecord,
      sig: eventId,
      contentSignature: newRecord.lastContentSignature,
    });
  }

  return {
    newEvents,
    goalPostEdits,
    eventPostEdits,
    injuryPostEdits,
    lineupPostAction,
    events: canonicalEvents,
    facebookPosts,
    eventStates: canonicalEvents, // backward-compatibility alias
  };
}

export default {
  WHITELISTED_EVENT_TYPES,
  isWhitelistedEvent,
  EVENT_EMOJIS,
  formatEventPost,
  formatLineupPost,
  formatFixturesPost,
  compareMatchState,
  getCanonicalEventId,
  getEventContentSignature,
};
