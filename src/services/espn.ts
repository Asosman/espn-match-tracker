import {
  MatchEventSummary,
  ComprehensiveMatchData,
  CoreLiveTriggerItem,
  PlayByPlayItem,
  TeamCompetitor,
} from '../types';
import { DateTime } from 'luxon';
import { MONITORED_LEAGUE_SLUGS } from '../utils/sportsConfig';

export const SITE_BASE = 'https://site.api.espn.com/apis/site/v2';
export const SITE_V3_BASE = 'https://site.api.espn.com/apis/site/v3';
export const CORE_BASE = 'https://sports.core.api.espn.com/v2';
export const CDN_BASE = 'https://cdn.espn.com/core';

/**
 * Gets date strings for Yesterday and Today in West Africa Time (Africa/Lagos)
 */
export function getWATDates() {
  const nowWAT = DateTime.now().setZone('Africa/Lagos');
  const yestWAT = nowWAT.minus({ days: 1 });

  return {
    nowWAT,
    yestWAT,
    todayDateStr: nowWAT.toFormat('yyyyLLdd'),
    yesterdayDateStr: yestWAT.toFormat('yyyyLLdd'),
    todayFormattedDisplay: nowWAT.toFormat('ccc, LLL d, yyyy'),
    yesterdayFormattedDisplay: yestWAT.toFormat('ccc, LLL d, yyyy'),
  };
}

/**
 * Gets yesterday's date object in local time
 */
export function getYesterdayDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Format a Date to ESPN standard YYYYMMDD format
 */
export function formatDateForEspn(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format a Date to standard human readable display
 */
export function formatDateDisplay(d: Date): string {
  const isYesterday = isSameDay(d, getYesterdayDate());
  const isToday = isSameDay(d, new Date());
  const dateFormatted = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (isYesterday) {
    return `Yesterday (${dateFormatted})`;
  }
  if (isToday) {
    return `Today (${dateFormatted})`;
  }
  return dateFormatted;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Normalizes ESPN competitor data so that displayName, logo, abbreviation,
 * score, and team crest are reliably available at top-level.
 */
export function normalizeCompetitor(c: any, index: number = 0): TeamCompetitor {
  const teamObj = c?.team || {};
  const teamId = String(teamObj.id || c?.id || '');

  // Extract clean display name
  const displayName =
    teamObj.displayName ||
    c?.displayName ||
    teamObj.name ||
    c?.name ||
    (c?.homeAway === 'home' ? 'Home Team' : 'Away Team');

  const shortDisplayName =
    teamObj.shortDisplayName || c?.shortDisplayName || displayName;

  // Extract abbreviation (e.g. ARS, RMA, MCI)
  const abbreviation =
    teamObj.abbreviation ||
    c?.abbreviation ||
    (displayName.length >= 3 ? displayName.slice(0, 3).toUpperCase() : 'FC');

  // Resolve team logo: prefer ESPN CDN SVG/PNG or explicit logo URL
  let logo = teamObj.logo || teamObj.logos?.[0]?.href || c?.logo || '';
  if (!logo && teamId) {
    logo = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
  }

  const homeAway = c?.homeAway || (index === 0 ? 'home' : 'away');
  const score =
    c?.score !== undefined && c?.score !== null ? String(c.score) : '-';

  return {
    id: teamId,
    uid: c?.uid || teamObj.uid,
    displayName,
    shortDisplayName,
    name: teamObj.name || c?.name,
    abbreviation,
    color: teamObj.color || c?.color,
    alternateColor: teamObj.alternateColor || c?.alternateColor,
    logo,
    score,
    homeAway,
    winner: Boolean(c?.winner),
    team: {
      id: teamId,
      uid: teamObj.uid,
      displayName,
      shortDisplayName,
      name: teamObj.name,
      abbreviation,
      logo,
      logos: teamObj.logos,
      color: teamObj.color,
      alternateColor: teamObj.alternateColor,
      isActive: teamObj.isActive,
    },
    records: c?.records || teamObj.record?.items || [],
    linescores: c?.linescores || [],
  };
}

/**
 * Dynamically determines if an AFC Champions League Elite match is in the East or West region.
 */
export function getAfcRegion(homeName?: string, awayName?: string): 'east' | 'west' {
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
 * Resolves a human-friendly football league name from season slugs or league identifiers
 */
export function resolveLeagueDisplayName(
  slug?: string,
  seasonSlug?: string,
  fallbackLeagueName?: string
): string {
  if (slug === 'afc.champions.east') return 'AFC Champions League Elite East';
  if (slug === 'afc.champions.west') return 'AFC Champions League Elite West';

  if (fallbackLeagueName && fallbackLeagueName !== 'Soccer' && fallbackLeagueName !== 'soccer') {
    return fallbackLeagueName;
  }

  const s = (seasonSlug || slug || '').toLowerCase();
  if (s.includes('english-premier-league') || s === 'eng.1') return 'English Premier League';
  if (s.includes('laliga') || s === 'esp.1') return 'Spanish LaLiga';
  if (s.includes('italian-serie-a') || s === 'ita.1') return 'Italian Serie A';
  if (s.includes('bundesliga') || s === 'ger.1') return 'German Bundesliga';
  if (s.includes('ligue-1') || s === 'fra.1') return 'French Ligue 1';
  if (s.includes('champions') || s === 'uefa.champions') return 'UEFA Champions League';
  if (s.includes('europa-conference') || s === 'uefa.europa.conf') return 'UEFA Europa Conference League';
  if (s.includes('europa') || s === 'uefa.europa') return 'UEFA Europa League';
  if (s.includes('mls') || s === 'usa.1') return 'Major League Soccer';
  if (s.includes('libertadores') || s === 'conmebol.libertadores') return 'Copa Libertadores';
  if (s.includes('fifa.world') || s.includes('world-cup')) return 'FIFA World Cup';
  if (s.includes('fa_cup') || s === 'eng.fa') return 'English FA Cup';
  if (s.includes('league_cup') || s.includes('carabao') || s === 'eng.league_cup') return 'English Carabao Cup';
  if (s.includes('copa_del_rey') || s === 'esp.copa_del_rey') return 'Spanish Copa del Rey';
  if (s.includes('eredivisie') || s === 'ned.1') return 'Dutch Eredivisie';
  if (s.includes('portuguese') || s === 'por.1') return 'Portuguese Primeira Liga';
  if (s.includes('saudi') || s === 'sau.1') return 'Saudi Pro League';

  return 'Football';
}

const commentaryCache = new Map<string, any[]>();

/**
 * Fetch and cache commentary for an event to enrich assist names
 */
async function getEventCommentary(eventId: string, leagueSlug: string): Promise<any[]> {
  if (commentaryCache.has(eventId)) {
    return commentaryCache.get(eventId)!;
  }
  try {
    let apiLeague = leagueSlug === 'sau.1' ? 'ksa.1' : leagueSlug;
    if (apiLeague.startsWith('afc.champions')) {
      apiLeague = 'afc.champions';
    }
    const url = `${SITE_BASE}/sports/soccer/${apiLeague}/summary?event=${eventId}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const comm = data.commentary || [];
      commentaryCache.set(eventId, comm);
      return comm;
    }
  } catch {
    // Soft failure
  }
  return [];
}

/**
 * Fetch scoreboard for a single league slug and date
 */
async function fetchSingleLeagueScoreboard(
  league: string,
  dateStr: string
): Promise<{ events: MatchEventSummary[]; leagueName?: string }> {
  let apiLeague = league === 'sau.1' ? 'ksa.1' : league;
  if (apiLeague.startsWith('afc.champions')) {
    apiLeague = 'afc.champions';
  }
  const url = `${SITE_BASE}/sports/soccer/${apiLeague}/scoreboard?dates=${dateStr}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Scoreboard request failed with HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawLeagueName = data.leagues?.[0]?.name;

    let events: MatchEventSummary[] = (data.events || []).map((e: any) => {
      const comp = e.competitions?.[0] || {};
      const competitors = (comp.competitors || []).map((c: any, idx: number) =>
        normalizeCompetitor(c, idx)
      );

      const seasonSlug = e.season?.slug;
      
      // Determine region slug for AFC
      let resolvedLeagueSlug = league;
      if (league.startsWith('afc.champions') || e.league?.slug === 'afc.champions' || comp.league?.slug === 'afc.champions') {
        const homeComp = competitors.find((c: any) => c.homeAway === 'home');
        const awayComp = competitors.find((c: any) => c.homeAway === 'away');
        const homeName = homeComp?.displayName || homeComp?.name || '';
        const awayName = awayComp?.displayName || awayComp?.name || '';
        const region = getAfcRegion(homeName, awayName);
        resolvedLeagueSlug = `afc.champions.${region}`;
      }

      const cleanLeague = resolveLeagueDisplayName(resolvedLeagueSlug, seasonSlug, rawLeagueName);
      const details = comp.details || e.details || [];

      return {
        id: String(e.id),
        uid: e.uid,
        date: e.date,
        name: e.name,
        shortName: e.shortName,
        sport: 'soccer',
        league: cleanLeague,
        resolvedLeagueSlug,
        details,
        status: e.status,
        competitions: [
          {
            ...comp,
            id: String(comp.id || e.id),
            date: comp.date || e.date,
            venue: comp.venue,
            attendance: comp.attendance,
            competitors,
            details,
            notes: comp.notes,
          },
        ],
      };
    });

    // If a specific region was requested, filter events to only that region
    if (league === 'afc.champions.east' || league === 'afc.champions.west') {
      events = events.filter((ev: MatchEventSummary) => ev.resolvedLeagueSlug === league);
    }

    // Enrich matches that have goals or scoring plays with summary commentary to capture assist names
    const matchesWithGoals = events.filter((ev) => {
      const comp = ev.competitions?.[0];
      const hasGoalDetail = comp?.details?.some(
        (d: any) => d.scoringPlay || d.type?.text?.toLowerCase().includes('goal')
      );
      const hasScore = comp?.competitors?.some((c) => parseInt(c.score, 10) > 0);
      return hasGoalDetail || hasScore;
    });

    if (matchesWithGoals.length > 0) {
      await Promise.allSettled(
        matchesWithGoals.map(async (ev) => {
          const comm = await getEventCommentary(ev.id, league);
          if (comm && comm.length > 0) {
            ev.commentary = comm;
          }
        })
      );
    }

    return {
      events,
      leagueName: rawLeagueName,
    };
  } catch (err) {
    console.warn(`Error fetching ESPN scoreboard for soccer/${league}:`, err);
    return { events: [] };
  }
}

/**
 * Fetch scoreboard for football for a given league slug and date.
 * If league is 'monitored-all' or 'all', queries the 17 monitored competitions simultaneously.
 */
export async function fetchScoreboard(
  sport: string = 'soccer',
  league: string = 'monitored-all',
  dateStr: string
): Promise<{ events: MatchEventSummary[]; leagueName?: string }> {
  if (league === 'monitored-all' || league === 'all') {
    // Concurrently fetch all 17 monitored leagues without querying the uncurated global 'all' feed
    const results = await Promise.allSettled(
      MONITORED_LEAGUE_SLUGS.map((slug) => fetchSingleLeagueScoreboard(slug, dateStr))
    );

    const mergedMap = new Map<string, MatchEventSummary>();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const ev of r.value.events) {
          if (!mergedMap.has(ev.id)) {
            mergedMap.set(ev.id, ev);
          }
        }
      }
    }

    return {
      events: Array.from(mergedMap.values()),
      leagueName: 'All Monitored Competitions',
    };
  }

  return fetchSingleLeagueScoreboard(league, dateStr);
}

/**
 * Fetch all ESPN endpoints for a specific matchup to build comprehensive data
 */
export async function fetchComprehensiveMatch(
  sport: string = 'soccer',
  league: string = 'all',
  eventId: string,
  fallbackEvent?: MatchEventSummary
): Promise<ComprehensiveMatchData> {
  const startTime = performance.now();
  const apiLeague = league.startsWith('afc.champions') ? 'afc.champions' : league;
  const siteSummaryUrl = `${SITE_BASE}/sports/soccer/${apiLeague}/summary?event=${eventId}`;
  const corePlaysUrl = `${CORE_BASE}/sports/soccer/leagues/${apiLeague}/events/${eventId}/competitions/${eventId}/plays?limit=100`;
  const cdnMatchUrl = `${CDN_BASE}/soccer/match?gameId=${eventId}&xhr=1`;
  const siteV3Url = `${SITE_V3_BASE}/sports/soccer/${apiLeague}/summary?event=${eventId}`;

  // Fetch in parallel
  const [summaryRes, corePlaysRes, cdnRes] = await Promise.allSettled([
    fetch(siteSummaryUrl).then((r) => (r.ok ? r.json() : null)),
    fetch(corePlaysUrl).then((r) => (r.ok ? r.json() : null)),
    fetch(cdnMatchUrl).then((r) => (r.ok ? r.json() : null)),
  ]);

  const summaryData = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
  const coreData = corePlaysRes.status === 'fulfilled' ? corePlaysRes.value : null;
  const cdnData = cdnRes.status === 'fulfilled' ? cdnRes.value : null;

  const endTime = performance.now();
  const latencyMs = Math.round(endTime - startTime);

  // Extract core live trigger items
  const corePlays: CoreLiveTriggerItem[] = [];
  if (coreData && Array.isArray(coreData.items)) {
    coreData.items.forEach((item: any) => {
      corePlays.push({
        id: item.id || String(Math.random()),
        type: item.type || { id: '0', text: 'Live Event', type: 'event' },
        wallclock: item.wallclock || item.modified || new Date().toISOString(),
        modified: item.modified || item.modifiedDate || '',
        period: item.period || { number: 1 },
        clock: item.clock || { displayValue: '', value: 0 },
        scoringPlay: Boolean(item.scoringPlay),
        scoreValue: Number(item.scoreValue || 0),
        priority: Boolean(item.priority),
        substitution: Boolean(item.substitution),
        yellowCard: Boolean(item.yellowCard),
        redCard: Boolean(item.redCard),
        penaltyKick: Boolean(item.penaltyKick),
        ownGoal: Boolean(item.ownGoal),
        hasVideoTagging: Boolean(item.hasVideoTagging),
        homeScore: Number(item.homeScore || 0),
        awayScore: Number(item.awayScore || 0),
        source: item.source || { id: '38', description: 'SA.ENVOY' },
        text: item.text || item.type?.text,
      });
    });
  }

  // Combine commentary and key events into play by play items
  const commentary: PlayByPlayItem[] = summaryData?.commentary || [];
  const keyEvents: PlayByPlayItem[] = summaryData?.keyEvents || [];
  const plays: PlayByPlayItem[] = summaryData?.plays || [];

  // Normalize header competitors if present
  let normalizedCompetitions = summaryData?.header?.competitions;
  if (normalizedCompetitions && normalizedCompetitions[0]?.competitors) {
    normalizedCompetitions[0].competitors = normalizedCompetitions[0].competitors.map(
      (c: any, i: number) => normalizeCompetitor(c, i)
    );
  }

  // Build event summary from header or fallback
  const event: MatchEventSummary = fallbackEvent || {
    id: eventId,
    date: summaryData?.header?.competitions?.[0]?.date || new Date().toISOString(),
    name:
      summaryData?.header?.competitions?.[0]?.competitors
        ?.map((c: any) => c.displayName || c.team?.displayName)
        .join(' vs ') || 'Match',
    shortName:
      summaryData?.header?.competitions?.[0]?.competitors
        ?.map((c: any) => c.abbreviation || c.team?.abbreviation)
        .join(' vs ') || 'Match',
    sport: 'soccer',
    league: fallbackEvent?.league || 'Football',
    status: summaryData?.header?.competitions?.[0]?.status || {
      type: {
        id: '3',
        name: 'STATUS_FINAL',
        state: 'post',
        completed: true,
        description: 'Final',
        detail: 'Final',
        shortDetail: 'FT',
      },
    },
    competitions: normalizedCompetitions || fallbackEvent?.competitions || [],
  };

  return {
    event,
    sport: 'soccer',
    league: event.league,
    header: summaryData?.header || cdnData?.gamepackageJSON?.header,
    boxscore: summaryData?.boxscore || cdnData?.gamepackageJSON?.boxscore,
    rosters: summaryData?.rosters || cdnData?.gamepackageJSON?.rosters,
    commentary,
    keyEvents,
    plays,
    corePlays,
    gameInfo: summaryData?.gameInfo || cdnData?.gamepackageJSON?.gameInfo,
    article: summaryData?.article || cdnData?.gamepackageJSON?.article,
    odds: summaryData?.odds || summaryData?.pickcenter,
    winprobability: summaryData?.winprobability,
    endpointsMeta: {
      siteSummaryUrl,
      corePlaysUrl,
      cdnMatchUrl,
      siteV3Url,
      fetchedAt: new Date().toISOString(),
      latencyMs,
    },
  };
}
