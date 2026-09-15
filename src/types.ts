/**
 * TypeScript types for ESPN sports data, matches, box scores,
 * player statistics, play-by-play logs, and live event triggers.
 */

export interface LeagueInfo {
  id: string;
  name: string;
  sport: string; // "soccer"
  slug: string;  // e.g. "all", "eng.1", "uefa.champions", "esp.1", "ita.1"
  category: string;
  icon: string;
}

export interface TeamCompetitor {
  id: string;
  uid?: string;
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  abbreviation: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
  score: string;
  homeAway: 'home' | 'away';
  winner?: boolean;
  team?: {
    id?: string;
    uid?: string;
    displayName?: string;
    shortDisplayName?: string;
    name?: string;
    abbreviation?: string;
    color?: string;
    alternateColor?: string;
    logo?: string;
    logos?: Array<{ href: string }>;
    isActive?: boolean;
  };
  records?: Array<{
    name?: string;
    type?: string;
    summary: string;
  }>;
  linescores?: Array<{
    value?: number;
    displayValue?: string;
    period?: number;
  }>;
}

export interface MatchDetailEvent {
  id?: string;
  type?: {
    id?: string;
    text?: string;
    type?: string;
  };
  clock?: {
    value?: number;
    displayValue?: string;
  };
  team?: {
    id?: string;
    displayName?: string;
  };
  scoreValue?: number;
  scoringPlay?: boolean;
  redCard?: boolean;
  yellowCard?: boolean;
  penaltyKick?: boolean;
  ownGoal?: boolean;
  athletesInvolved?: Array<{
    id?: string;
    displayName?: string;
    shortName?: string;
    fullName?: string;
    jersey?: string;
    position?: string;
  }>;
  participants?: Array<{
    athlete?: {
      id?: string;
      displayName?: string;
      shortName?: string;
    };
    type?: string;
  }>;
  text?: string;
  shortText?: string;
}

export interface MatchEventSummary {
  id: string;
  uid?: string;
  date: string;
  name: string;
  shortName: string;
  sport: string;
  league: string;
  details?: MatchDetailEvent[];
  commentary?: any[];
  status: {
    clock?: number;
    displayClock?: string;
    period?: number;
    type: {
      id: string;
      name: string;
      state: 'pre' | 'in' | 'post';
      completed: boolean;
      description: string;
      detail: string;
      shortDetail: string;
    };
  };
  competitions: Array<{
    id: string;
    date: string;
    attendance?: number;
    venue?: {
      fullName: string;
      address?: {
        city?: string;
        country?: string;
        state?: string;
      };
    };
    competitors: TeamCompetitor[];
    details?: MatchDetailEvent[];
    notes?: Array<{ text: string }>;
  }>;
}

export interface TeamStatComparison {
  name: string;
  label: string;
  homeValue: string | number;
  awayValue: string | number;
  homeNumeric: number;
  awayNumeric: number;
}

export interface PlayerStatItem {
  name: string;
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  value: number | string;
  displayValue: string;
}

export interface PlayerRosterItem {
  starter: boolean;
  subbedIn?: boolean;
  subbedOut?: boolean;
  jersey?: string;
  formationPlace?: string;
  position?: {
    name?: string;
    displayName?: string;
    abbreviation?: string;
  };
  athlete: {
    id: string;
    fullName: string;
    displayName: string;
    shortName?: string;
    headshot?: {
      href: string;
      alt?: string;
    };
    jerseyImages?: Array<{ href: string }>;
  };
  stats: PlayerStatItem[];
}

export interface AmericanSportPlayerStatGroup {
  type: string;
  labels: string[];
  descriptions?: string[];
  athletes: Array<{
    starter: boolean;
    batOrder?: number;
    position?: {
      displayName: string;
      abbreviation: string;
    };
    athlete: {
      id: string;
      displayName: string;
      shortName?: string;
      headshot?: { href: string };
      position?: { abbreviation: string };
    };
    stats: string[];
  }>;
  totals?: string[];
}

export interface PlayByPlayItem {
  id: string;
  sequenceNumber?: string;
  time?: {
    displayValue: string;
  };
  clock?: {
    value?: number;
    displayValue?: string;
  };
  period?: {
    number?: number;
    displayValue?: string;
  };
  text: string;
  alternativeText?: string;
  type?: {
    id?: string;
    text: string;
    type?: string;
  };
  team?: {
    id: string;
    displayName?: string;
    logo?: string;
    abbreviation?: string;
  };
  scoringPlay?: boolean;
  scoreValue?: number;
  homeScore?: number;
  awayScore?: number;
  wallclock?: string;
  priority?: boolean;
  participants?: Array<{
    athlete: {
      id: string;
      displayName: string;
    };
    type?: string;
  }>;
}

export interface CoreLiveTriggerItem {
  id: string;
  type: {
    id: string;
    text: string;
    type: string;
  };
  wallclock: string;
  modified: string;
  period: { number: number };
  clock: { displayValue: string; value: number };
  scoringPlay: boolean;
  scoreValue: number;
  priority: boolean;
  substitution?: boolean;
  yellowCard?: boolean;
  redCard?: boolean;
  penaltyKick?: boolean;
  ownGoal?: boolean;
  hasVideoTagging?: boolean;
  homeScore: number;
  awayScore: number;
  source?: {
    id: string;
    description: string;
  };
  text?: string;
}

export interface ComprehensiveMatchData {
  event: MatchEventSummary;
  sport: string;
  league: string;
  header: any;
  boxscore?: {
    teams?: Array<{
      team: {
        id: string;
        displayName: string;
        abbreviation: string;
        logo?: string;
        color?: string;
      };
      statistics: Array<{
        name: string;
        displayValue: string;
        label: string;
      }>;
    }>;
    players?: Array<{
      team: {
        id: string;
        displayName: string;
        logo?: string;
      };
      statistics: AmericanSportPlayerStatGroup[];
    }>;
  };
  rosters?: Array<{
    homeAway: 'home' | 'away';
    team: {
      id: string;
      displayName: string;
      abbreviation: string;
      logo?: string;
      color?: string;
    };
    formation?: string;
    roster: PlayerRosterItem[];
  }>;
  commentary?: PlayByPlayItem[];
  keyEvents?: PlayByPlayItem[];
  plays?: PlayByPlayItem[];
  corePlays?: CoreLiveTriggerItem[];
  gameInfo?: {
    venue?: {
      fullName?: string;
      address?: {
        city?: string;
        country?: string;
        state?: string;
      };
      capacity?: number;
    };
    attendance?: number;
    officials?: Array<{
      displayName: string;
      position?: { displayName: string };
    }>;
    weather?: {
      displayValue?: string;
      temperature?: number;
      conditionId?: string;
    };
  };
  article?: {
    headline?: string;
    story?: string;
    description?: string;
  };
  odds?: Array<{
    provider?: { name: string };
    details?: string;
    overUnder?: number;
    spread?: number;
    homeTeamOdds?: { winPercentage?: number; moneyLine?: number };
    awayTeamOdds?: { winPercentage?: number; moneyLine?: number };
  }>;
  winprobability?: Array<{
    playId?: string;
    homeWinPercentage?: number;
    secondsLeft?: number;
  }>;
  endpointsMeta: {
    siteSummaryUrl: string;
    corePlaysUrl: string;
    cdnMatchUrl: string;
    siteV3Url: string;
    fetchedAt: string;
    latencyMs: number;
  };
}
