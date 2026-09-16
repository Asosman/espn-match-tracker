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

  const homeShootout = homeComp.shootoutScore !== undefined ? parseInt(homeComp.shootoutScore, 10) : null;
  const awayShootout = awayComp.shootoutScore !== undefined ? parseInt(awayComp.shootoutScore, 10) : null;
  const shootout = (homeShootout !== null && awayShootout !== null && !isNaN(homeShootout) && !isNaN(awayShootout))
    ? { home: homeShootout, away: awayShootout }
    : null;

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
    shootout,
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
 * Never includes match score as an identity.
 * @param {object} ev
 * @param {string} fixtureId
 * @returns {string}
 */
export function eventSignature(ev, fixtureId) {
  const type = (ev.type || 'EVENT').toUpperCase();
  if (ev.id) {
    return `${fixtureId}:${type}:${ev.id}`;
  }
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : (ev.clock || '0');
  const period = ev.period || 1;
  const teamId = ev.teamId || '';
  return `${fixtureId}:${type}:p${period}:m${minute}:t${teamId}`;
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
 * Determines whether a raw item or play is from a post-match penalty shootout.
 * Shootout kicks are tiebreakers and must NEVER be treated as match goals or in-game penalties.
 * @param {any} item
 * @returns {boolean}
 */
export function isShootoutEvent(item) {
  if (!item) return false;
  const play = item.play || {};
  const periodNum = item.period?.number ?? play.period?.number ?? (typeof item.period === 'number' ? item.period : null) ?? (typeof play.period === 'number' ? play.period : null);
  if (periodNum === 5) return true;

  const periodType = String(item.period?.type || play.period?.type || item.period?.slug || play.period?.slug || '').toUpperCase();
  if (periodType.includes('SHOOTOUT')) return true;

  const typeText = String(item.type?.text || play.type?.text || item.type?.type || play.type?.type || '').toLowerCase();
  if (typeText.includes('shootout')) return true;

  const text = String(item.text || play.text || item.shortText || play.shortText || '').toLowerCase();
  if (text.includes('penalty shootout') || text.includes('shootout')) return true;
  if (item.shootoutPlay === true || item.isShootout === true || play.shootout === true) return true;

  // ESPN shootout commentary scoreline pattern like "Barnsley 3(1)" or "3(1), Barnsley 3(2)" or "3(4)"
  if (/\b\d+\s*\(\d+\)/.test(text)) return true;

  return false;
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

  // Penalty Shootout kicks are tiebreakers, NOT regular match goals or in-game penalties!
  if (isShootoutEvent(item)) {
    return null;
  }

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

  const teamId = String(item.team?.id || item.competitor?.id || item.teamId || '');
  const teamName = String(item.team?.displayName || item.team?.name || item.competitor?.displayName || item.competitor?.name || '');
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
  // 1. GOAL & DISALLOWED GOAL & OWN GOAL Detection
  if (
    item.scoringPlay === true ||
    item.ownGoal === true ||
    typeText.includes('goal') ||
    typeText.includes('own') ||
    typeText.includes('autogol') ||
    lowerText.includes('goal') ||
    lowerText.includes('own goal') ||
    lowerText.includes('own-goal') ||
    lowerText.includes('autogol') ||
    lowerText.includes('gol en contra')
  ) {
    const isOwnGoal =
      item.ownGoal === true ||
      lowerText.includes('own goal') ||
      lowerText.includes('own-goal') ||
      lowerText.includes('autogol') ||
      lowerText.includes('gol en contra') ||
      typeText.includes('own goal') ||
      typeText.includes('own-goal') ||
      typeText.includes('autogol');
    const isDisallowed =
      lowerText.includes('disallowed') ||
      lowerText.includes('overturned') ||
      lowerText.includes('no goal') ||
      typeText.includes('disallowed');

    let scorer = primaryAthlete;
    let assist = secondaryAthlete || null;

    // Free text regex extraction if athletesInvolved was empty
    if (!scorer && isOwnGoal) {
      const ogMatch = text.match(/(?:Own\s*Goal\s+by|Autogol\s+de|Gol\s+en\s+contra\s+de)\s+([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?)(?:\s*\(|,|\.|$)/i);
      if (ogMatch) {
        scorer = ogMatch[1].trim();
      }
    }
    if (!scorer) {
      const scorerMatch = text.match(/(?:Goal!|Goal\s+).*?([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\s+\(| scored|\.|$)/);
      if (scorerMatch) {
        scorer = scorerMatch[1].trim();
      }
    }

    let playerTeam = teamName;
    if (isOwnGoal && text) {
      const tmMatch = text.match(/(?:Own\s*Goal\s+by|Autogol\s+de|Gol\s+en\s+contra\s+de)\s+[A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?(?:,|\()\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)(?:\)|\.|$)/i);
      if (tmMatch) {
        playerTeam = tmMatch[1].trim();
      }
    }

    if (!assist && !isOwnGoal && lowerText.includes('assisted by')) {
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

    let extractedHomeScore = item.homeScore !== undefined && item.homeScore !== null ? parseInt(item.homeScore, 10) : null;
    let extractedAwayScore = item.awayScore !== undefined && item.awayScore !== null ? parseInt(item.awayScore, 10) : null;

    // Parse score from text like "Goal! Platense 1, Fluminense 0." or "Own Goal by Sven Botman, Newcastle United. Manchester United 1, Newcastle United 0."
    if (text) {
      const p1 = text.match(/(?:Goal!.*?\b|Own\s*Goal.*?\b|\b)([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+)/i);
      if (p1) {
        const t1 = p1[1].trim().toLowerCase();
        const s1 = parseInt(p1[2], 10);
        const t2 = p1[3].trim().toLowerCase();
        const s2 = parseInt(p1[4], 10);
        const hName = (matchContext.homeName || '').toLowerCase().trim();
        const aName = (matchContext.awayName || '').toLowerCase().trim();
        if (hName && (t1.includes(hName) || hName.includes(t1))) {
          extractedHomeScore = s1;
          extractedAwayScore = s2;
        } else if (aName && (t1.includes(aName) || aName.includes(t1))) {
          extractedHomeScore = s2;
          extractedAwayScore = s1;
        } else {
          extractedHomeScore = s1;
          extractedAwayScore = s2;
        }
      } else if (extractedHomeScore === null || (extractedHomeScore === 0 && extractedAwayScore === 0)) {
        const p2 = text.match(/(\d+)\s*[-–]\s*(\d+)/);
        if (p2) {
          extractedHomeScore = parseInt(p2[1], 10);
          extractedAwayScore = parseInt(p2[2], 10);
        }
      }
    }

    if (isDisallowed) {
      return {
        type: 'GOAL_DISALLOWED',
        teamId,
        teamName,
        player: scorer || null,
        assist: assist || null,
        minute: minute || 0,
        stoppageTime,
        period: item.period?.number || 1,
        homeScore: extractedHomeScore,
        awayScore: extractedAwayScore,
        disallowed: true,
        reason: text,
        text,
      };
    }

    const hasValidScore = extractedHomeScore !== null && extractedAwayScore !== null && (extractedHomeScore > 0 || extractedAwayScore > 0);

    return {
      type: isOwnGoal ? 'OWN_GOAL' : 'GOAL',
      teamId,
      teamName: playerTeam || teamName,
      player: scorer || null,
      assist: isOwnGoal ? null : (assist || null),
      minute: minute || 0,
      stoppageTime,
      period: item.period?.number || 1,
      homeScore: extractedHomeScore,
      awayScore: extractedAwayScore,
      scoreAfterEvent: hasValidScore ? { home: extractedHomeScore, away: extractedAwayScore } : null,
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

  // 3. PENALTIES Detection (Only whitelisted PENALTY SCORED is permitted)
  if (item.penaltyKick === true || typeText.includes('penalty') || lowerText.includes('penalty')) {
    const isScored =
      lowerText.includes('scores') ||
      lowerText.includes('converted') ||
      lowerText.includes('converts penalty') ||
      typeText.includes('scored') ||
      item.scoringPlay === true;

    if (isScored) {
      let player = primaryAthlete;
      if (!player) {
        const penMatch = text.match(/penalty (?:taken by|scored by) ([A-Z][a-zA-Z\s.-]+?)(?:\.|$)/i);
        if (penMatch) player = penMatch[1].trim();
      }

      let extractedHomeScore = item.homeScore !== undefined && item.homeScore !== null ? parseInt(item.homeScore, 10) : null;
      let extractedAwayScore = item.awayScore !== undefined && item.awayScore !== null ? parseInt(item.awayScore, 10) : null;

      if ((extractedHomeScore === null || (extractedHomeScore === 0 && extractedAwayScore === 0)) && text) {
        const p1 = text.match(/\b([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+)/i);
        if (p1) {
          const t1 = p1[1].trim().toLowerCase();
          const s1 = parseInt(p1[2], 10);
          const t2 = p1[3].trim().toLowerCase();
          const s2 = parseInt(p1[4], 10);
          const hName = (matchContext.homeName || '').toLowerCase().trim();
          const aName = (matchContext.awayName || '').toLowerCase().trim();
          if (hName && (t1.includes(hName) || hName.includes(t1))) {
            extractedHomeScore = s1;
            extractedAwayScore = s2;
          } else if (aName && (t1.includes(aName) || aName.includes(t1))) {
            extractedHomeScore = s2;
            extractedAwayScore = s1;
          } else {
            extractedHomeScore = s1;
            extractedAwayScore = s2;
          }
        } else {
          const p2 = text.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (p2) {
            extractedHomeScore = parseInt(p2[1], 10);
            extractedAwayScore = parseInt(p2[2], 10);
          }
        }
      }

      const hasValidScore = extractedHomeScore !== null && extractedAwayScore !== null && (extractedHomeScore > 0 || extractedAwayScore > 0);

      return {
        type: 'PENALTY_SCORED',
        outcome: 'SCORED',
        player: player || null,
        teamId,
        teamName,
        minute: minute || 0,
        period: item.period?.number || 1,
        homeScore: extractedHomeScore,
        awayScore: extractedAwayScore,
        scoreAfterEvent: hasValidScore ? { home: extractedHomeScore, away: extractedAwayScore } : null,
        text,
      };
    }

    // Missed penalties, saved penalties, or penalty awarded are strictly ignored per whitelist
    return null;
  }

  // 4. HALFTIME & FULLTIME Detection
  if (
    typeText.includes('halftime') ||
    lowerText.includes('half time') ||
    lowerText.includes('half-time')
  ) {
    return {
      type: 'HALF_TIME',
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
      type: 'FULL_TIME',
      minute: minute || 90,
      period: 2,
      homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
      awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
      text: text || 'Full Time',
    };
  }

  // 5. VAR Detection (Only allowed if directly resulting in a disallowed goal)
  if (typeText.includes('var') || lowerText.includes('var decision') || lowerText.includes('var:')) {
    const isDisallowed =
      lowerText.includes('disallowed') ||
      lowerText.includes('overturned') ||
      lowerText.includes('no goal');

    if (isDisallowed) {
      return {
        type: 'GOAL_DISALLOWED',
        teamId,
        player: primaryAthlete || null,
        minute: minute || 0,
        period: item.period?.number || 1,
        homeScore: item.homeScore !== undefined ? item.homeScore : null,
        awayScore: item.awayScore !== undefined ? item.awayScore : null,
        reason: text,
        text,
      };
    }

    // General VAR checks/reviews are ignored per whitelist
    return null;
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

    if (homeComp) {
      normalized.homeId = String(homeComp.id || homeComp.team?.id || normalized.homeId || '');
      if (homeComp.team?.displayName || homeComp.team?.name) {
        normalized.homeName = homeComp.team.displayName || homeComp.team.name;
      }
    }
    if (awayComp) {
      normalized.awayId = String(awayComp.id || awayComp.team?.id || normalized.awayId || '');
      if (awayComp.team?.displayName || awayComp.team?.name) {
        normalized.awayName = awayComp.team.displayName || awayComp.team.name;
      }
    }

    const homeShootout = homeComp?.shootoutScore !== undefined ? parseInt(homeComp.shootoutScore, 10) : null;
    const awayShootout = awayComp?.shootoutScore !== undefined ? parseInt(awayComp.shootoutScore, 10) : null;
    if (homeShootout !== null && awayShootout !== null && !isNaN(homeShootout) && !isNaN(awayShootout)) {
      normalized.shootout = { home: homeShootout, away: awayShootout };
    }
  }

  // Fallback: extract shootout score from summary.shootout if not present on competitors
  if (!normalized.shootout && summary?.shootout?.length >= 2) {
    const t1 = summary.shootout[0];
    const t2 = summary.shootout[1];
    const s1 = t1.shots?.filter((s) => s.didScore).length || 0;
    const s2 = t2.shots?.filter((s) => s.didScore).length || 0;
    const hId = String(normalized.homeId || '');
    if (String(t1.id) === hId || (t1.team && normalized.homeName && t1.team.toLowerCase().includes(normalized.homeName.toLowerCase()))) {
      normalized.shootout = { home: s1, away: s2 };
    } else {
      normalized.shootout = { home: s2, away: s1 };
    }
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
    if (isShootoutEvent(item)) continue;
    const parsed = normalizeEvent(item, normalized);
    if (parsed) {
      extractedEvents.push(parsed);
    }
  }

  // Check commentary to enrich assists and capture goals, own goals, or other whitelisted events
  if (summary?.commentary?.length > 0) {
    for (const com of summary.commentary) {
      if (isShootoutEvent(com)) continue;
      const isGoal =
        com.play?.type?.text === 'Goal' ||
        com.play?.type?.text === 'Own Goal' ||
        (com.text && (
          com.text.toLowerCase().includes('goal!') ||
          com.text.toLowerCase().includes('own goal') ||
          com.text.toLowerCase().includes('autogol')
        ));
      if (isGoal) {
        const parsed = normalizeEvent(com, normalized);
        if (parsed) {
          const existing = extractedEvents.find(
            (e) => (e.type === 'GOAL' || e.type === 'OWN_GOAL' || e.type === 'PENALTY_SCORED') &&
                   (e.minute === parsed.minute || (e.player && parsed.player && e.player.toLowerCase() === parsed.player.toLowerCase()))
          );
          if (existing) {
            if (!existing.assist && parsed.assist) {
              existing.assist = parsed.assist;
            }
            if (!existing.ownGoal && parsed.ownGoal) {
              existing.ownGoal = true;
              existing.type = 'OWN_GOAL';
            }
          } else {
            extractedEvents.push(parsed);
          }
        }
      }
    }

    // Scan commentary for other allowed events (e.g. RED_CARD, GOAL_DISALLOWED, PENALTY_SCORED)
    for (const com of summary.commentary) {
      if (isShootoutEvent(com)) continue;
      const parsed = normalizeEvent(com, normalized);
      if (parsed) {
        if (parsed.type === 'GOAL' || parsed.type === 'OWN_GOAL') continue; // Goals & Own goals already handled above

        const isDuplicate = extractedEvents.some(
          (e) => e.type === parsed.type && e.minute === parsed.minute
        );

        if (!isDuplicate) {
          extractedEvents.push(parsed);
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
