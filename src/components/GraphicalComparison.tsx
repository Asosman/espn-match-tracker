import React from 'react';
import { BarChart3, TrendingUp, ShieldCheck, Activity, Award } from 'lucide-react';
import { ComprehensiveMatchData } from '../types';
import { TeamLogo } from './MatchCard';

interface GraphicalComparisonProps {
  matchData: ComprehensiveMatchData;
}

export const GraphicalComparison: React.FC<GraphicalComparisonProps> = ({ matchData }) => {
  const comp = matchData.event.competitions?.[0];
  const competitors = comp?.competitors || [];
  const homeTeam =
    competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayTeam =
    competitors.find((c) => c.homeAway === 'away') || competitors[1];

  // Boxscore team stats
  const boxTeams = matchData.boxscore?.teams || [];
  const homeBoxTeam = boxTeams.find(
    (bt) => bt.team?.id === homeTeam?.id || bt.team?.displayName === homeTeam?.displayName
  ) || boxTeams[1];
  const awayBoxTeam = boxTeams.find(
    (bt) => bt.team?.id === awayTeam?.id || bt.team?.displayName === awayTeam?.displayName
  ) || boxTeams[0];

  const homeStats = homeBoxTeam?.statistics || [];
  const awayStats = awayBoxTeam?.statistics || [];

  // Match stats pairs by name or label
  interface StatComparisonItem {
    label: string;
    awayVal: string;
    homeVal: string;
    awayNum: number;
    homeNum: number;
  }

  const comparisons: StatComparisonItem[] = [];

  // Parse stats list
  if (awayStats.length > 0 || homeStats.length > 0) {
    awayStats.forEach((as) => {
      const hs = homeStats.find((h) => h.name === as.name || h.label === as.label);
      const awayNum = parseFloat(String(as.displayValue).replace(/[^0-9.]/g, '')) || 0;
      const homeNum = parseFloat(String(hs?.displayValue || '0').replace(/[^0-9.]/g, '')) || 0;

      comparisons.push({
        label: as.label || as.name,
        awayVal: as.displayValue,
        homeVal: hs?.displayValue || '0',
        awayNum,
        homeNum,
      });
    });
  } else {
    // If sport doesn't have boxscore.teams (e.g. some baseball summaries where stats are in players/linescore),
    // we construct comparisons from linescores or standard metrics
    const awayScore = parseFloat(awayTeam?.score || '0');
    const homeScore = parseFloat(homeTeam?.score || '0');
    comparisons.push({
      label: 'Final Score',
      awayVal: String(awayTeam?.score || 0),
      homeVal: String(homeTeam?.score || 0),
      awayNum: awayScore,
      homeNum: homeScore,
    });

    if (awayTeam?.linescores && homeTeam?.linescores) {
      const periodsCount = Math.max(awayTeam.linescores.length, homeTeam.linescores.length);
      for (let i = 0; i < periodsCount; i++) {
        const aP = awayTeam.linescores[i]?.value ?? 0;
        const hP = homeTeam.linescores[i]?.value ?? 0;
        comparisons.push({
          label: `Period / Inning ${i + 1}`,
          awayVal: String(aP),
          homeVal: String(hP),
          awayNum: aP,
          homeNum: hP,
        });
      }
    }
  }

  // Win Probability / Odds if available
  const winProb = matchData.winprobability;
  const latestWinProb = winProb && winProb.length > 0 ? winProb[winProb.length - 1] : null;
  const homeWinPct = latestWinProb?.homeWinPercentage
    ? Math.round(latestWinProb.homeWinPercentage * 100)
    : null;
  const awayWinPct = homeWinPct !== null ? 100 - homeWinPct : null;

  // Colors
  const awayColor = awayTeam?.color ? `#${awayTeam.color}` : '#3b82f6';
  const homeColor = homeTeam?.color ? `#${homeTeam.color}` : '#ef4444';

  return (
    <div className="space-y-6">
      {/* Team header overview banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          {/* Away team */}
          <div className="flex items-center gap-3">
            <TeamLogo team={awayTeam} size="md" />
            <div>
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Away</div>
              <div className="text-base font-bold text-white">{awayTeam?.displayName || awayTeam?.team?.displayName || 'Away Team'}</div>
            </div>
          </div>

          <div className="text-center px-3">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
              Matchup Comparison
            </span>
            <div className="text-2xl font-black text-white tabular-nums tracking-tight">
              {awayTeam?.score !== undefined ? awayTeam.score : 0} - {homeTeam?.score !== undefined ? homeTeam.score : 0}
            </div>
          </div>

          {/* Home team */}
          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Home</div>
              <div className="text-base font-bold text-white">{homeTeam?.displayName || homeTeam?.team?.displayName || 'Home Team'}</div>
            </div>
            <TeamLogo team={homeTeam} size="md" />
          </div>
        </div>

        {/* Win Probability / Momentum Bar if available */}
        {homeWinPct !== null && awayWinPct !== null && (
          <div className="pt-4">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5 text-neutral-300">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                {awayTeam?.shortDisplayName || 'Away'} {awayWinPct}%
              </span>
              <span className="text-neutral-400 font-normal">Calculated Win Probability</span>
              <span className="flex items-center gap-1">
                {homeWinPct}% {homeTeam?.shortDisplayName || 'Home'}
                <TrendingUp className="w-3.5 h-3.5 text-red-400" />
              </span>
            </div>
            <div className="w-full h-3 bg-neutral-800 rounded-full overflow-hidden flex">
              <div
                className="h-full transition-all duration-500 bg-blue-500"
                style={{ width: `${awayWinPct}%` }}
              />
              <div
                className="h-full transition-all duration-500 bg-red-500"
                style={{ width: `${homeWinPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Graphical Comparisons List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-bold text-white">Team Statistical Head-to-Head</h3>
          </div>
          <span className="text-xs text-neutral-400">
            Comparing verified ESPN boxscore metrics
          </span>
        </div>

        {comparisons.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-sm">
            Detailed team statistics comparison is being synchronized from ESPN boxscore.
          </div>
        ) : (
          <div className="space-y-4">
            {comparisons.map((stat, idx) => {
              const total = stat.awayNum + stat.homeNum;
              const awayPct =
                total > 0 ? Math.round((stat.awayNum / total) * 100) : 50;
              const homePct = 100 - awayPct;

              // Check if away or home has higher stat
              const awayHigher = stat.awayNum > stat.homeNum;
              const homeHigher = stat.homeNum > stat.awayNum;

              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`font-semibold tabular-nums text-sm ${
                        awayHigher ? 'text-white' : 'text-neutral-400'
                      }`}
                    >
                      {stat.awayVal}
                    </span>
                    <span className="text-neutral-300 font-medium tracking-wide">
                      {stat.label}
                    </span>
                    <span
                      className={`font-semibold tabular-nums text-sm ${
                        homeHigher ? 'text-white' : 'text-neutral-400'
                      }`}
                    >
                      {stat.homeVal}
                    </span>
                  </div>

                  {/* Visual dual comparison bar */}
                  <div className="w-full h-2.5 bg-neutral-950 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-neutral-800">
                    <div className="w-1/2 flex justify-end">
                      <div
                        className={`h-full rounded-l-full transition-all duration-300 ${
                          awayHigher ? 'bg-blue-500' : 'bg-blue-800/60'
                        }`}
                        style={{ width: `${(awayPct / 100) * 100}%` }}
                      />
                    </div>
                    <div className="w-1/2 flex justify-start">
                      <div
                        className={`h-full rounded-r-full transition-all duration-300 ${
                          homeHigher ? 'bg-red-500' : 'bg-red-800/60'
                        }`}
                        style={{ width: `${(homePct / 100) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
