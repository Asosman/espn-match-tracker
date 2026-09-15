// services/espn.js
import axios from 'axios';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { isDateInTodayWAT, formatKickoffWAT, getTodayDateWAT, getTodayDateIsoWAT } from '../utils/time.js';
import { withRetry, resolveWithFallbacks } from '../utils/retry.js';

// ESPN API Base Hosts
export const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
export const SITE_V3_BASE = 'https://site.api.espn.com/apis/v3/sports/soccer';
export const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/soccer';
export const CDN_BASE = 'https://cdn.espn.com/core/soccer';

// Comprehensive list of monitored football competitions / league slugs (strictly the 17 user-specified leagues)
export const COMPREHENSIVE_LEAGUES = [
  { slug: 'eng.1', name: 'English Premier League' },
  { slug: 'esp.1', name: 'Spanish LaLiga' },
  { slug: 'ita.1', name: 'Italian Serie A' },
  { slug: 'ger.1', name: 'German Bundesliga' },
  { slug: 'fra.1', name: 'French Ligue 1' },
  { slug: 'uefa.champions', name: 'UEFA Champions League' },
  { slug: 'uefa.europa', name: 'UEFA Europa League' },
  { slug: 'uefa.europa.conf', name: 'UEFA Europa Conference League' },
  { slug: 'usa.1', name: 'Major League Soccer' },
  { slug: 'conmebol.libertadores', name: 'Copa Libertadores' },
  { slug: 'fifa.world', name: 'FIFA World Cup' },
  { slug: 'eng.fa', name: 'English FA Cup' },
  { slug: 'eng.league_cup', name: 'English Carabao Cup' },
  { slug: 'esp.copa_del_rey', name: 'Spanish Copa del Rey' },
  { slug: 'ned.1', name: 'Dutch Eredivisie' },
  { slug: 'por.1', name: 'Portuguese Primeira Liga' },
  { slug: 'sau.1', name: 'Saudi Pro League' },
  { slug: 'afc.champions.east', name: 'AFC Champions League Elite East' },
  { slug: 'afc.champions.west', name: 'AFC Champions League Elite West' },
];

// Single shared axios instance with configured timeout
const apiClient = axios.create({
  timeout: config.espn.requestTimeoutMs || 15000,
  headers: {
    'Accept': 'application/json',
  },
});

// Cache for athlete details to prevent duplicate requests
const athleteCache = new Map();

/**
 * Dynamically determines if an AFC Champions League Elite match is in the East or West region.
 * @param {string} homeName
 * @param {string} awayName
 * @returns {'east' | 'west'}
 */
export function getAfcRegion(homeName, awayName) {
  const westKeywords = [
    'hilal', 'nassr', 'ahli', 'sadd', 'gharafa', 'rayyan', 'ain', 'wasl', 
    'pakhtakor', 'persepolis', 'esteghlal', 'shorta', 'saudi', 'qatar', 'uae', 
    'uzbekistan', 'iran', 'iraq', 'baghdad', 'tehran', 'riyadh', 'dubai', 'doha', 'ahly'
  ];
  
  const eastKeywords = [
    'kobe', 'kawasaki', 'yokohama', 'hiroshima', 'central coast', 'mariners', 
    'gwangju', 'daejeon', 'ulsan', 'shanghai', 'shenhua', 'johor', 'buriram', 
    'kyoto', 'japan', 'korea', 'china', 'australia', 'thailand', 'malaysia', 
    'singapore', 'sanga', 'citizen', 'marinos', 'frontale', 'vissel', 'port',
    'sydney', 'melbourne', 'victory', 'adelaide'
  ];

  const h = (homeName || '').toLowerCase();
  const a = (awayName || '').toLowerCase();

  // Check West first
  for (const kw of westKeywords) {
    if (h.includes(kw) || a.includes(kw)) {
      return 'west';
    }
  }

  // Check East
  for (const kw of eastKeywords) {
    if (h.includes(kw) || a.includes(kw)) {
      return 'east';
    }
  }

  // Fallback default
  return 'east';
}

/**
 * Normalizes an ESPN competition event into the application's standard NormalizedMatch shape.
 * @param {any} event
 * @param {string} [leagueSlugFallback]
 * @returns {any}
 */
export function normalizeMatch(event, leagueSlugFallback = 'soccer') {
  const comp = event.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0] || {};
  const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1] || {};

  const homeScore = parseInt(homeComp.score ?? '0', 10) || 0;
  const awayScore = parseInt(awayComp.score ?? '0', 10) || 0;

  const statusType = comp.status?.type || event.status?.type || {};
  const state = statusType.state || 'pre'; // 'pre', 'in', 'post'

  let description = 'Scheduled';
  if (state === 'in') {
    if (statusType.name === 'STATUS_HALFTIME') {
      description = 'Halftime';
    } else if (comp.status?.period === 2) {
      description = 'Second half';
    } else {
      description = 'In Progress';
    }
  } else if (state === 'post') {
    description = statusType.shortDetail || 'Full Time';
  } else if (statusType.name === 'STATUS_POSTPONED') {
    description = 'Postponed';
  } else if (statusType.name === 'STATUS_CANCELED') {
    description = 'Cancelled';
  }

  let leagueSlug = event.league?.slug || comp.league?.slug || leagueSlugFallback;
  
  // Custom logic to handle AFC Champions League Elite regions
  if (leagueSlug === 'afc.champions' || leagueSlugFallback?.startsWith('afc.champions')) {
    const homeName = homeComp.team?.displayName || homeComp.team?.name || '';
    const awayName = awayComp.team?.displayName || awayComp.team?.name || '';
    const region = getAfcRegion(homeName, awayName);
    leagueSlug = `afc.champions.${region}`;
  }

  const leagueDef = COMPREHENSIVE_LEAGUES.find(
    (l) => l.slug === leagueSlug || l.slug === leagueSlugFallback
  );
  const leagueName =
    event.league?.name ||
    comp.league?.name ||
    leagueDef?.name ||
    leagueSlug;

  return {
    fixtureId: String(event.id || comp.id),
    uid: event.uid || `s:600~e:${event.id}`,
    homeName: homeComp.team?.displayName || homeComp.team?.name || 'Home Team',
    awayName: awayComp.team?.displayName || awayComp.team?.name || 'Away Team',
    homeId: String(homeComp.id || homeComp.team?.id || ''),
    awayId: String(awayComp.id || awayComp.team?.id || ''),
    homeLogo: homeComp.team?.logo || '',
    awayLogo: awayComp.team?.logo || '',
    homeAbbreviation: homeComp.team?.abbreviation || '',
    awayAbbreviation: awayComp.team?.abbreviation || '',
    leagueName,
    leagueSlug,
    kickoff: event.date || comp.date || new Date().toISOString(),
    kickoffFormattedWAT: formatKickoffWAT(event.date || comp.date),
    venue: comp.venue?.fullName || '',
    status: {
      state,
      description,
      detail: statusType.detail || statusType.shortDetail || description,
      clock: comp.status?.displayClock || `${comp.status?.clock || 0}'`,
      period: comp.status?.period || 0,
      name: statusType.name || '',
    },
    score: {
      home: homeScore,
      away: awayScore,
    },
    lineups: {
      home: [],
      away: [],
    },
    lineupsAvailable: false,
    events: [],
    raw: {
      id: event.id,
      name: event.name,
      shortName: event.shortName,
    },
  };
}

/**
 * Creates a deterministic, stable signature for an event to prevent duplicate posts across polling cycles.
 * Format: {fixtureId}:{eventType}:{minute}:{homeScore}-{awayScore}:{player}
 * @param {object} ev
 * @param {string} fixtureId
 * @returns {string}
 */
export function eventSignature(ev, fixtureId) {
  const type = (ev.type || 'EVENT').toUpperCase();
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : (ev.clock || '0');
  const home = ev.score?.home ?? ev.homeScore ?? 0;
  const away = ev.score?.away ?? ev.awayScore ?? 0;
  const player = (ev.player || ev.athlete || ev.playerName || '').trim().toLowerCase();
  return `${fixtureId}:${type}:${minute}:${home}-${away}:${player}`;
}

/**
 * Resolves an athlete ID or $ref URL to a player display name.
 * Checks cache first to minimize external network requests.
 * @param {string} athleteRefOrId
 * @param {string} [leagueSlug='eng.1']
 * @returns {Promise<string>}
 */
export async function resolveAthlete(athleteRefOrId, leagueSlug = 'eng.1') {
  if (!athleteRefOrId) return '';
  if (athleteCache.has(athleteRefOrId)) {
    return athleteCache.get(athleteRefOrId);
  }

  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  let url = athleteRefOrId;
  if (!athleteRefOrId.startsWith('http')) {
    url = `${CORE_BASE}/leagues/${apiSlug}/athletes/${athleteRefOrId}`;
  }

  try {
    const res = await withRetry(() => apiClient.get(url), 2, `ResolveAthlete(${athleteRefOrId})`);
    const name = res.data?.displayName || res.data?.fullName || res.data?.name || '';
    if (name) {
      athleteCache.set(athleteRefOrId, name);
      return name;
    }
  } catch (err) {
    logger.debug(`Could not resolve athlete ${athleteRefOrId}: ${err.message}`);
  }

  return '';
}

/**
 * Fetches all football matches strictly scheduled for the current calendar date in West Africa Time (Africa/Lagos).
 *
 * Strict Date Guarantee:
 * - Current calendar day determined by Africa/Lagos
 * - Discovers fixtures via global 'all' scoreboard and core competitions
 * - Strictly filters out yesterday, tomorrow, and future matches
 * - Deduplicates by fixture ID
 * - Sorts chronologically
 *
 * @param {string} [targetDateWAT] optional override date in YYYY-MM-DD format (defaults to current date in WAT)
 * @returns {Promise<any[]>}
 */
export async function fetchTodaysMatches(targetDateWAT = null) {
  const activeDateWAT = targetDateWAT || getTodayDateIsoWAT();
  const dateStrForEspn = activeDateWAT.replace(/-/g, ''); // YYYYMMDD

  logger.info(`[ESPN] Fetching today's football matches...`);
  logger.info(`[ESPN] Date: ${activeDateWAT}`);
  logger.info(`[ESPN] Timezone: Africa/Lagos`);

  const matchesMap = new Map();
  let competitionsChecked = 0;
  let matchesDiscovered = 0;
  let duplicatesCount = 0;

  // Query the 17 monitored competitions in parallel with controlled concurrency
  const priorityLeagues = COMPREHENSIVE_LEAGUES;
  const leagueBatches = [];
  const batchSize = 6;

  for (let i = 0; i < priorityLeagues.length; i += batchSize) {
    leagueBatches.push(priorityLeagues.slice(i, i + batchSize));
  }

  for (const batch of leagueBatches) {
    await Promise.allSettled(
      batch.map(async (league) => {
        competitionsChecked++;
        try {
          let apiSlug = league.slug === 'sau.1' ? 'ksa.1' : league.slug;
          if (apiSlug && apiSlug.startsWith('afc.champions')) {
            apiSlug = 'afc.champions';
          }
          const url = `${SITE_BASE}/${apiSlug}/scoreboard?dates=${dateStrForEspn}`;
          const res = await withRetry(() => apiClient.get(url), 1, `ESPN ${league.name} Scoreboard`);
          const events = res.data?.events || [];

          for (const ev of events) {
            matchesDiscovered++;
            const id = String(ev.id);
            if (matchesMap.has(id)) {
              duplicatesCount++;
              continue;
            }

            const kickoffUtc = ev.date || ev.competitions?.[0]?.date;
            if (isDateInTodayWAT(kickoffUtc, activeDateWAT)) {
              matchesMap.set(id, normalizeMatch(ev, league.slug));
            }
          }
        } catch (err) {
          logger.debug(`League scoreboard for ${league.slug} returned: ${err.message}`);
        }
      })
    );
  }

  const finalMatches = Array.from(matchesMap.values());

  // Sort chronologically by kickoff timestamp
  finalMatches.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  logger.info(`[ESPN] Competitions checked: ${competitionsChecked}`);
  logger.info(`[ESPN] Matches discovered: ${matchesDiscovered}`);
  logger.info(`[ESPN] Matches after strict WAT date filtering: ${finalMatches.length}`);
  logger.info(`[ESPN] Duplicates removed: ${duplicatesCount}`);

  return finalMatches;
}

/**
 * Alias for getTodayMatches for backwards/cross-module compatibility.
 * @param {string} [targetDateWAT]
 * @returns {Promise<any[]>}
 */
export async function getTodayMatches(targetDateWAT = null) {
  return fetchTodaysMatches(targetDateWAT);
}

/**
 * Fetches match summary payload from ESPN's SITE API.
 * Contains header, boxscore, rosters (lineups), keyEvents, commentary.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @returns {Promise<any>}
 */
export async function getMatchSummary(fixtureId, leagueSlug = 'eng.1') {
  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  const url = `${SITE_BASE}/${apiSlug}/summary?event=${fixtureId}`;
  return withRetry(() => apiClient.get(url), config.espn.maxRetries, `MatchSummary(${fixtureId})`)
    .then((res) => res.data)
    .catch((err) => {
      logger.warn(`Failed to fetch match summary for fixture ${fixtureId}: ${err.message}`);
      return null;
    });
}

/**
 * Fetches detailed plays from the CORE ESPN API.
 * Used as fallback for event feeds, scorer/assist attribution, and penalties.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @returns {Promise<any[]>}
 */
export async function getMatchPlays(fixtureId, leagueSlug = 'eng.1') {
  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  const url = `${CORE_BASE}/leagues/${apiSlug}/events/${fixtureId}/competitions/${fixtureId}/plays?limit=300`;
  try {
    const res = await withRetry(() => apiClient.get(url), 2, `MatchPlays(${fixtureId})`);
    return res.data?.items || [];
  } catch (err) {
    logger.debug(`Could not fetch core plays for fixture ${fixtureId}: ${err.message}`);
    return [];
  }
}

/**
 * Extracts lineups using ESPN's multi-step fallback chain:
 * 1. summary?event={fixtureId} -> rosters[]
 * 2. CORE roster endpoint
 * 3. Athlete $ref resolution
 * Gated by pre-kickoff status in the event engine.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @param {any} [preloadedSummary]
 * @returns {Promise<{ home: string[], away: string[], startersHome: any[], startersAway: any[], hasLineups: boolean }>}
 */
export async function getMatchLineups(fixtureId, leagueSlug = 'eng.1', preloadedSummary = null) {
  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  const summary = preloadedSummary || (await getMatchSummary(fixtureId, apiSlug));

  // Step 1: Check summary.rosters
  const rosters = summary?.rosters;
  if (Array.isArray(rosters) && rosters.length >= 2) {
    const homeRoster = rosters.find((r) => r.homeAway === 'home') || rosters[0];
    const awayRoster = rosters.find((r) => r.homeAway === 'away') || rosters[1];

    const extractNames = (rosterObj) => {
      const athletes = rosterObj?.roster || [];
      const starters = athletes.filter((a) => a.starter === true);
      const chosen = starters.length >= 7 ? starters : athletes.slice(0, 11);
      return chosen
        .map((a) => a.athlete?.displayName || a.athlete?.fullName || a.athlete?.name || '')
        .filter(Boolean);
    };

    const homeNames = extractNames(homeRoster);
    const awayNames = extractNames(awayRoster);

    if (homeNames.length >= 7 && awayNames.length >= 7) {
      return {
        home: homeNames,
        away: awayNames,
        startersHome: homeRoster?.roster?.filter((a) => a.starter) || [],
        startersAway: awayRoster?.roster?.filter((a) => a.starter) || [],
        hasLineups: true,
      };
    }
  }

  // Step 2: Fallback to core competitor roster
  logger.debug(`Lineups not complete in summary for ${fixtureId}; attempting core roster fallback...`);
  try {
    const compUrl = `${CORE_BASE}/leagues/${apiSlug}/events/${fixtureId}/competitions/${fixtureId}`;
    const compRes = await apiClient.get(compUrl);
    const competitors = compRes.data?.competitors || [];

    if (competitors.length >= 2) {
      const fetchCoreRoster = async (teamRef) => {
        const rosterRef = teamRef?.roster?.$ref;
        if (!rosterRef) return [];
        const rRes = await apiClient.get(rosterRef);
        const entries = rRes.data?.entries || [];
        const starterEntries = entries.filter((e) => e.starter === true);
        const targetEntries = starterEntries.length >= 7 ? starterEntries : entries.slice(0, 11);

        const names = [];
        for (const entry of targetEntries) {
          if (entry.athlete?.$ref) {
            const name = await resolveAthlete(entry.athlete.$ref, apiSlug);
            if (name) names.push(name);
          }
        }
        return names;
      };

      const homeNames = await fetchCoreRoster(competitors[0]);
      const awayNames = await fetchCoreRoster(competitors[1]);

      if (homeNames.length >= 7 && awayNames.length >= 7) {
        return {
          home: homeNames,
          away: awayNames,
          startersHome: [],
          startersAway: [],
          hasLineups: true,
        };
      }
    }
  } catch (err) {
    logger.debug(`Core roster fallback failed for ${fixtureId}: ${err.message}`);
  }

  return {
    home: [],
    away: [],
    startersHome: [],
    startersAway: [],
    hasLineups: false,
  };
}

/**
 * Normalizes an in-match event from ESPN keyEvents, commentary, or plays.
 * Handles goals, red cards, injuries, penalties, VAR, state transitions.
 * @param {any} item
 * @param {any} matchContext
 * @returns {any|null}
 */
function _normalizeEvent(item, matchContext = {}) {
  if (!item) return null;

  const text = (item.text || item.alternativeText || '').trim();
  const lowerText = text.toLowerCase();
  const typeText = (item.type?.text || item.type?.type || '').toLowerCase();

  // Determine clock / minute
  let minute = null;
  let stoppageTime = null;
  const clockStr = item.clock?.displayValue || item.time?.displayValue || item.clock?.value || '';

  if (clockStr) {
    const match = String(clockStr).match(/(\d+)(?:\+(\d+))?/);
    if (match) {
      minute = parseInt(match[1], 10);
      if (match[2]) {
        stoppageTime = parseInt(match[2], 10);
      }
    }
  }

  // Fallback: extract minute from text e.g. "(37')"
  if (minute === null) {
    const textMinMatch = text.match(/(\d+)'/);
    if (textMinMatch) {
      minute = parseInt(textMinMatch[1], 10);
    }
  }

  const teamId = String(item.team?.id || item.competitor?.id || '');
  const rawAthletes =
    item.athletesInvolved ||
    item.participants?.map((p) => p.athlete || p) ||
    item.play?.participants?.map((p) => p.athlete || p) ||
    [];

  const getAthleteName = (a) => {
    if (!a) return '';
    if (typeof a === 'string') return a;
    if (a.athlete) {
      return a.athlete.displayName || a.athlete.name || a.athlete.fullName || a.athlete.shortName || '';
    }
    return a.displayName || a.name || a.fullName || a.shortName || '';
  };

  let primaryAthlete = getAthleteName(rawAthletes[0]);
  let secondaryAthlete = getAthleteName(rawAthletes[1]);

  // 1. GOAL & DISALLOWED GOAL Detection
  if (
    item.scoringPlay === true ||
    typeText.includes('goal') ||
    lowerText.includes('goal!') ||
    lowerText.startsWith('goal') ||
    lowerText.includes('goal disallowed')
  ) {
    const isOwnGoal = lowerText.includes('own goal') || typeText.includes('own goal');
    const isDisallowed =
      lowerText.includes('disallowed') ||
      lowerText.includes('overturned') ||
      lowerText.includes('no goal') ||
      typeText.includes('disallowed');

    let scorer = primaryAthlete;
    let assist = secondaryAthlete || null;

    // Free text regex extraction if athletesInvolved was empty
    if (!scorer) {
      const scorerMatch = text.match(/Goal!.*?([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\s+\(| scored|\.|$)/);
      if (scorerMatch) {
        scorer = scorerMatch[1].trim();
      }
    }
    if (!assist && lowerText.includes('assisted by')) {
      const assistMatch = text.match(
        /assisted by\s+([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?)(?=\s+(?:with|following|after|through|from|via|on|\(|,|;|\.|$)|[.,;)]|$)/i
      );
      if (assistMatch) {
        let cleanAssist = assistMatch[1].trim().replace(/[.,;)]+$/, '').trim();
        cleanAssist = cleanAssist.replace(/\s+(?:with|following|after|through|from|via|on)$/i, '').trim();
        if (cleanAssist.length >= 2 && cleanAssist.length <= 40) {
          assist = cleanAssist;
        }
      }
    }

    if (isDisallowed) {
      return {
        type: 'GOAL_DISALLOWED',
        teamId,
        player: scorer || null,
        assist: assist || null,
        minute: minute || 0,
        stoppageTime,
        period: item.period?.number || 1,
        homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
        awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
        disallowed: true,
        reason: text,
        text,
      };
    }

    return {
      type: 'GOAL',
      teamId,
      player: scorer || null,
      assist: assist || null,
      minute: minute || 0,
      stoppageTime,
      period: item.period?.number || 1,
      homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
      awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
      ownGoal: isOwnGoal,
      disallowed: false,
      text,
    };
  }

  // 2. RED CARD Detection
  if (
    item.redCard === true ||
    typeText.includes('red card') ||
    lowerText.includes('red card') ||
    lowerText.includes('sent off')
  ) {
    const isSecondYellow = lowerText.includes('second yellow') || lowerText.includes('2nd yellow');
    let player = primaryAthlete;
    if (!player) {
      const cardMatch = text.match(/([A-Z][a-zA-Z\s.-]+?)\s+(?:is shown the red card|sent off)/i);
      if (cardMatch) player = cardMatch[1].trim();
    }

    return {
      type: 'RED_CARD',
      player: player || null,
      teamId,
      minute: minute || 0,
      period: item.period?.number || 1,
      isSecondYellow,
      description: text,
      text,
    };
  }

  // 3. INJURY Detection
  if (lowerText.includes('injury') || lowerText.includes('injured') || lowerText.includes('stretchered off')) {
    let player = primaryAthlete;
    if (!player) {
      const injMatch = text.match(/([A-Z][a-zA-Z\s.-]+?)\s+(?:is injured|suffers an injury|stretchered)/i);
      if (injMatch) player = injMatch[1].trim();
    }

    return {
      type: 'INJURY',
      player: player || null,
      teamId,
      minute: minute || 0,
      period: item.period?.number || 1,
      description: text,
      text,
    };
  }

  // 4. PENALTIES Detection (Scored / Missed)
  if (item.penaltyKick === true || typeText.includes('penalty') || lowerText.includes('penalty')) {
    const isScored =
      lowerText.includes('scores') ||
      lowerText.includes('converted') ||
      lowerText.includes('converts penalty') ||
      typeText.includes('scored') ||
      item.scoringPlay === true;
    const isMissed =
      lowerText.includes('missed') ||
      lowerText.includes('saved') ||
      lowerText.includes('hit the post') ||
      lowerText.includes('over the bar') ||
      typeText.includes('missed');

    let player = primaryAthlete;
    if (!player) {
      const penMatch = text.match(/penalty (?:taken by|scored by|missed by|saved by) ([A-Z][a-zA-Z\s.-]+?)(?:\.|$)/i);
      if (penMatch) player = penMatch[1].trim();
    }

    if (isMissed) {
      return {
        type: 'PENALTY_MISSED',
        outcome: 'MISSED',
        player: player || null,
        teamId,
        minute: minute || 0,
        period: item.period?.number || 1,
        text,
      };
    }

    if (isScored) {
      return {
        type: 'PENALTY_SCORED',
        outcome: 'SCORED',
        player: player || null,
        teamId,
        minute: minute || 0,
        period: item.period?.number || 1,
        text,
      };
    }

    // Penalty Awarded
    return {
      type: 'PENALTY',
      outcome: 'AWARDED',
      player: player || null,
      teamId,
      minute: minute || 0,
      period: item.period?.number || 1,
      text,
    };
  }

  // 5. HALFTIME & FULLTIME Detection
  if (
    typeText.includes('halftime') ||
    lowerText.includes('half time') ||
    lowerText.includes('half-time')
  ) {
    return {
      type: 'HALFTIME',
      minute: minute || 45,
      period: 1,
      homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
      awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
      text: text || 'Halftime',
    };
  }

  if (
    typeText.includes('full time') ||
    typeText.includes('final') ||
    lowerText.includes('full time') ||
    lowerText.includes('full-time')
  ) {
    return {
      type: 'FULLTIME',
      minute: minute || 90,
      period: 2,
      homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
      awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
      text: text || 'Full Time',
    };
  }

  // 6. VAR Detection
  if (typeText.includes('var') || lowerText.includes('var decision') || lowerText.includes('var:')) {
    return {
      type: 'VAR',
      text,
      minute: minute || 0,
      period: item.period?.number || 1,
    };
  }

  return null;
}

export function normalizeEvent(item, matchContext = {}) {
  const result = _normalizeEvent(item, matchContext);
  if (result) {
    if (item.id) {
      result.id = String(item.id);
    } else if (item.play?.id) {
      result.id = String(item.play.id);
    }
    let occurrenceTime = null;
    let rawTime = item.wallclock || item.wallClock || item.play?.wallclock || item.play?.wallClock || item.timestamp || item.date;
    if (rawTime) {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) {
        occurrenceTime = d.toISOString();
      }
    }
    if (!occurrenceTime && matchContext.kickoff && result.minute !== undefined && result.minute !== null) {
      const kickoff = new Date(matchContext.kickoff);
      if (!isNaN(kickoff.getTime())) {
        const extraMinutes = result.minute + (result.minute > 45 ? 15 : 0);
        occurrenceTime = new Date(kickoff.getTime() + extraMinutes * 60 * 1000).toISOString();
      }
    }
    if (!occurrenceTime) {
      occurrenceTime = new Date().toISOString();
    }
    result.occurrenceTime = occurrenceTime;
  }
  return result;
}

/**
 * Fetches comprehensive match details, merging data across all ESPN endpoints.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @param {any} [existingMatch]
 * @returns {Promise<any>}
 */
export async function fetchMatchDetails(fixtureId, leagueSlug = 'eng.1', existingMatch = null) {
  const summary = await getMatchSummary(fixtureId, leagueSlug);
  let normalized;
  
  if (existingMatch) {
    normalized = {
      ...existingMatch,
      status: {
        state: existingMatch.lastStatus,
        period: existingMatch.lastPeriod,
        clock: existingMatch.lastClock,
        description: '', // or initialize as needed
        detail: '',
        name: ''
      },
      score: existingMatch.lastScore
    };
  } else {
    normalized = normalizeMatch(summary?.header || { id: fixtureId }, leagueSlug);
  }

  // Update status and scores from summary
  if (summary?.header?.competitions?.[0]) {
    const comp = summary.header.competitions[0];
    const statusType = comp.status?.type || {};
    normalized.status.state = statusType.state || normalized.status.state;
    normalized.status.clock = comp.status?.displayClock || normalized.status.clock;
    normalized.status.period = comp.status?.period ?? normalized.status.period;
    normalized.status.name = statusType.name || normalized.status.name;

    const competitors = comp.competitors || [];
    const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0];
    const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1];
    if (homeComp?.score !== undefined) normalized.score.home = parseInt(homeComp.score, 10) || 0;
    if (awayComp?.score !== undefined) normalized.score.away = parseInt(awayComp.score, 10) || 0;
  }

  // Lineups Resolution
  const lineupsResult = await getMatchLineups(fixtureId, leagueSlug, summary);
  normalized.lineups = {
    home: lineupsResult.home,
    away: lineupsResult.away,
  };
  normalized.lineupsAvailable = lineupsResult.hasLineups;

  // Key events from summary
  const keyEvents = summary?.keyEvents || [];
  const extractedEvents = [];

  for (const item of keyEvents) {
    const parsed = normalizeEvent(item, normalized);
    if (parsed) {
      extractedEvents.push(parsed);
    }
  }

  // Check commentary to enrich assists and capture goals
  if (summary?.commentary?.length > 0) {
    for (const com of summary.commentary) {
      const isGoal = com.play?.type?.text === 'Goal' || (com.text && com.text.toLowerCase().includes('goal!'));
      if (isGoal) {
        const parsed = normalizeEvent(com, normalized);
        if (parsed) {
          const existing = extractedEvents.find(
            (e) => e.type === 'GOAL' && (e.minute === parsed.minute || (e.player && parsed.player && e.player.toLowerCase() === parsed.player.toLowerCase()))
          );
          if (existing) {
            if (!existing.assist && parsed.assist) {
              existing.assist = parsed.assist;
            }
          } else {
            extractedEvents.push(parsed);
          }
        }
      }
    }

    // Always scan commentary for other non-goal events (e.g. INJURY, VAR, PENALTY, RED_CARD)
    // that might not be in keyEvents but exist in the commentary stream.
    for (const com of summary.commentary) {
      const parsed = normalizeEvent(com, normalized);
      if (parsed) {
        if (parsed.type === 'GOAL') continue; // Goals are already handled above

        const isDuplicate = extractedEvents.some(
          (e) => e.type === parsed.type && e.minute === parsed.minute
        );

        if (!isDuplicate) {
          extractedEvents.push(parsed);
        } else if (parsed.type === 'INJURY') {
          // If the injury exists, but now has resolved player information, enrich it in place
          const existing = extractedEvents.find(
            (e) => e.type === 'INJURY' && e.minute === parsed.minute
          );
          if (existing && !existing.player && parsed.player) {
            existing.player = parsed.player;
            existing.description = parsed.description;
            existing.text = parsed.text;
          }
        }
      }
    }
  }

  normalized.events = extractedEvents;
  return normalized;
}

export default {
  SITE_BASE,
  SITE_V3_BASE,
  CORE_BASE,
  CDN_BASE,
  COMPREHENSIVE_LEAGUES,
  fetchTodaysMatches,
  getTodayMatches,
  getMatchSummary,
  getMatchPlays,
  getMatchLineups,
  resolveAthlete,
  normalizeMatch,
  normalizeEvent,
  eventSignature,
  fetchMatchDetails,
};
