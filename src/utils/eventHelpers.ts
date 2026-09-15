import { MatchDetailEvent, MatchEventSummary } from '../types';

export interface ParsedGoal {
  scorer: string;
  assist?: string | null;
  minute: string;
  teamId?: string;
  isHomeTeam?: boolean;
  ownGoal?: boolean;
}

export interface ParsedDisallowedGoal {
  player?: string | null;
  minute: string;
  reason?: string;
  teamId?: string;
}

export interface ParsedPenalty {
  player?: string | null;
  minute: string;
  outcome: 'scored' | 'missed';
  teamId?: string;
}

export interface ParsedRedCard {
  player: string;
  minute: string;
  isSecondYellow?: boolean;
  teamId?: string;
}

export interface ParsedHalfFullTime {
  halftime?: { home: number | string; away: number | string };
  fulltime?: { home: number | string; away: number | string };
  isCompleted: boolean;
  isHalftime: boolean;
  isSecondHalf: boolean;
}

/**
 * Extract assist name cleanly from match commentary or event text
 */
export function extractAssistFromText(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(
    /assisted by\s+([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?)(?=\s+(?:with|following|after|through|from|via|on|\(|,|;|\.|$)|[.,;)]|$)/i
  );
  if (m) {
    let clean = m[1].trim().replace(/[.,;)]+$/, '').trim();
    clean = clean.replace(/\s+(?:with|following|after|through|from|via|on)$/i, '').trim();
    if (clean.length >= 2 && clean.length <= 40) {
      return clean;
    }
  }
  return null;
}

/**
 * Extracts goal scorers, assists, disallowed goals, penalties, red cards,
 * and halftime/fulltime stats from match details, linescores, and commentary.
 */
export function extractMatchHighlights(match: MatchEventSummary, matchData?: any) {
  const comp = match.competitions?.[0];
  const competitors = comp?.competitors || [];
  const homeTeam = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayTeam = competitors.find((c) => c.homeAway === 'away') || competitors[1];

  const homeId = String(homeTeam?.id || homeTeam?.team?.id || '');
  const awayId = String(awayTeam?.id || awayTeam?.team?.id || '');

  const rawDetails: MatchDetailEvent[] = comp?.details || match.details || [];

  const goals: ParsedGoal[] = [];
  const disallowedGoals: ParsedDisallowedGoal[] = [];
  const penaltiesScored: ParsedPenalty[] = [];
  const penaltiesMissed: ParsedPenalty[] = [];
  const redCards: ParsedRedCard[] = [];

  const getAthleteName = (item: any): string => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    if (item.athlete) {
      return (
        item.athlete.displayName ||
        item.athlete.name ||
        item.athlete.fullName ||
        item.athlete.shortName ||
        ''
      );
    }
    return item.displayName || item.name || item.fullName || item.shortName || '';
  };

  rawDetails.forEach((d) => {
    const text = (d.text || '').trim();
    const lowerText = text.toLowerCase();
    const typeText = (d.type?.text || d.type?.type || '').toLowerCase();
    const clock = d.clock?.displayValue || (d.clock?.value ? `${Math.floor(d.clock.value / 60)}'` : '');

    // Athletes Involved or participants extraction
    const rawAthletes: any[] =
      (d.athletesInvolved as any[]) ||
      d.participants?.map((p: any) => p.athlete || p) ||
      (d as any).play?.participants?.map((p: any) => p.athlete || p) ||
      [];

    let primaryAthlete = getAthleteName(rawAthletes[0]);
    let secondaryAthlete = getAthleteName(rawAthletes[1]) || extractAssistFromText(text);

    const eventTeamId = String(d.team?.id || '');
    const isHome = eventTeamId ? eventTeamId === homeId : undefined;

    // 1. DISALLOWED GOALS (VAR / Referee)
    const isDisallowed =
      typeText.includes('disallowed') ||
      lowerText.includes('disallowed') ||
      lowerText.includes('overturned') ||
      lowerText.includes('no goal');

    if (isDisallowed) {
      if (!primaryAthlete) {
        const disMatch = text.match(/([A-Z][a-zA-Z\s.-]+?)(?:'s goal|goal disallowed|'s penalty)/i);
        if (disMatch) primaryAthlete = disMatch[1].trim();
      }
      disallowedGoals.push({
        player: primaryAthlete || 'Goal',
        minute: clock,
        reason: text || 'Overturned by VAR',
        teamId: eventTeamId,
      });
      return;
    }

    // 2. PENALTIES (Scored vs Missed)
    const isPenaltyKick = d.penaltyKick === true || typeText.includes('penalty') || lowerText.includes('penalty');
    if (isPenaltyKick) {
      const isMissed =
        lowerText.includes('missed') ||
        lowerText.includes('saved') ||
        lowerText.includes('hit the post') ||
        lowerText.includes('over the bar');
      const isScored =
        d.scoringPlay === true ||
        lowerText.includes('scores') ||
        lowerText.includes('converts') ||
        typeText.includes('scored');

      if (!primaryAthlete) {
        const pMatch = text.match(/penalty (?:taken by|scored by|missed by) ([A-Z][a-zA-Z\s.-]+?)(?:\.|$)/i);
        if (pMatch) primaryAthlete = pMatch[1].trim();
      }

      if (isMissed) {
        penaltiesMissed.push({
          player: primaryAthlete || null,
          minute: clock,
          outcome: 'missed',
          teamId: eventTeamId,
        });
        return;
      }
      if (isScored) {
        penaltiesScored.push({
          player: primaryAthlete || null,
          minute: clock,
          outcome: 'scored',
          teamId: eventTeamId,
        });
      }
    }

    // 3. GOALS & ASSISTS
    const isGoal =
      d.scoringPlay === true ||
      typeText.includes('goal') ||
      lowerText.includes('goal!') ||
      lowerText.startsWith('goal');

    if (isGoal) {
      const ownGoal = d.ownGoal === true || lowerText.includes('own goal') || typeText.includes('own goal');

      if (!primaryAthlete) {
        const scorerMatch = text.match(/Goal!.*?([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\s+\(| scored|\.|$)/);
        if (scorerMatch) primaryAthlete = scorerMatch[1].trim();
      }

      if (!secondaryAthlete && lowerText.includes('assisted by')) {
        secondaryAthlete = extractAssistFromText(text);
      }

      goals.push({
        scorer: primaryAthlete || (ownGoal ? 'Own Goal' : 'Goal'),
        assist: secondaryAthlete || null,
        minute: clock,
        teamId: eventTeamId,
        isHomeTeam: isHome,
        ownGoal,
      });
      return;
    }

    // 4. RED CARDS (Player Name & Minute)
    const isRedCard =
      d.redCard === true ||
      typeText.includes('red card') ||
      lowerText.includes('red card') ||
      lowerText.includes('sent off');

    if (isRedCard) {
      if (!primaryAthlete) {
        const cardMatch = text.match(/([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)\s+(?:is shown the red card|sent off)/i);
        if (cardMatch) primaryAthlete = cardMatch[1].trim();
      }
      const isSecondYellow = lowerText.includes('second yellow') || lowerText.includes('2nd yellow');

      redCards.push({
        player: primaryAthlete || 'Player',
        minute: clock,
        isSecondYellow,
        teamId: eventTeamId,
      });
    }
  });

  // Cross-reference with commentary to extract or enrich assists and capture goals
  const commentaryList: any[] =
    (match as any).commentary ||
    matchData?.summary?.commentary ||
    matchData?.commentary ||
    [];

  if (commentaryList.length > 0) {
    for (const c of commentaryList) {
      const cText = (c.text || '').trim();
      const cLower = cText.toLowerCase();
      const isGoalComment =
        c.play?.type?.text === 'Goal' ||
        cLower.startsWith('goal!') ||
        cLower.includes('goal!');

      if (isGoalComment) {
        const parts: any[] = c.play?.participants || [];
        const cScorer =
          getAthleteName(parts[0]) ||
          (cText.match(/Goal!.*?([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\s+\(| scored|\.|$)/)?.[1] || '').trim();
        const cAssist = getAthleteName(parts[1]) || extractAssistFromText(cText);
        const cClock =
          c.time?.displayValue ||
          c.clock?.displayValue ||
          (cText.match(/(\d+)'/)?.[1] ? `${cText.match(/(\d+)'/)?.[1]}'` : '');
        const isOwnGoal = cLower.includes('own goal');

        if (cScorer) {
          // Find if we already have this goal in goals list
          const existingGoal = goals.find((g) => {
            if (
              g.scorer &&
              cScorer &&
              (g.scorer.toLowerCase().includes(cScorer.toLowerCase()) ||
                cScorer.toLowerCase().includes(g.scorer.toLowerCase()))
            ) {
              return true;
            }
            if (g.minute && cClock && g.minute === cClock) {
              return true;
            }
            return false;
          });

          if (existingGoal) {
            // Enrich missing assist
            if (!existingGoal.assist && cAssist) {
              existingGoal.assist = cAssist;
            }
          } else {
            // Goal wasn't in scoreboard details, add it!
            goals.push({
              scorer: cScorer,
              assist: cAssist || null,
              minute: cClock,
              ownGoal: isOwnGoal,
            });
          }
        }
      }

      // Check for disallowed goals in commentary
      if (cLower.includes('goal disallowed') || (cLower.includes('var') && cLower.includes('no goal'))) {
        const existingDis = disallowedGoals.some((d) => d.reason?.toLowerCase().includes(cLower.slice(0, 30)));
        if (!existingDis) {
          disallowedGoals.push({
            player: 'Goal',
            minute: c.time?.displayValue || c.clock?.displayValue || '',
            reason: cText,
          });
        }
      }
    }
  }

  // Halftime / Fulltime Breakdown
  const statusType = match.status?.type;
  const isCompleted = Boolean(statusType?.completed || statusType?.state === 'post');
  const isHalftime =
    statusType?.name === 'STATUS_HALFTIME' ||
    statusType?.description?.toLowerCase().includes('halftime') ||
    statusType?.detail?.toLowerCase().includes('half');
  const isSecondHalf =
    statusType?.state === 'in' && (match.status?.period ?? 1) >= 2;

  let halftime: { home: number | string; away: number | string } | undefined;
  if (homeTeam?.linescores && homeTeam.linescores[0] !== undefined) {
    halftime = {
      home: homeTeam.linescores[0].displayValue ?? homeTeam.linescores[0].value ?? 0,
      away: awayTeam?.linescores?.[0]?.displayValue ?? awayTeam?.linescores?.[0]?.value ?? 0,
    };
  }

  let fulltime: { home: number | string; away: number | string } | undefined;
  if (isCompleted && homeTeam?.score !== undefined && awayTeam?.score !== undefined) {
    fulltime = {
      home: homeTeam.score,
      away: awayTeam.score,
    };
  }

  const timing: ParsedHalfFullTime = {
    halftime,
    fulltime,
    isCompleted,
    isHalftime,
    isSecondHalf,
  };

  return {
    goals,
    disallowedGoals,
    penaltiesScored,
    penaltiesMissed,
    redCards,
    timing,
    homeTeam,
    awayTeam,
  };
}
