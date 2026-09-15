import React, { useState } from 'react';
import { Users, Search, Award, ShieldAlert, Zap, Clock } from 'lucide-react';
import {
  ComprehensiveMatchData,
  PlayerRosterItem,
  AmericanSportPlayerStatGroup,
} from '../types';
import { TeamLogo } from './MatchCard';

interface BoxScorePlayerStatsProps {
  matchData: ComprehensiveMatchData;
}

export const BoxScorePlayerStats: React.FC<BoxScorePlayerStatsProps> = ({ matchData }) => {
  const comp = matchData.event.competitions?.[0];
  const competitors = comp?.competitors || [];
  const homeTeam =
    competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayTeam =
    competitors.find((c) => c.homeAway === 'away') || competitors[1];

  // Selected team for player stats view
  const [selectedTeamTab, setSelectedTeamTab] = useState<'away' | 'home'>('away');
  const [lineupFilter, setLineupFilter] = useState<'all' | 'starters' | 'bench'>('all');
  const [playerSearch, setPlayerSearch] = useState('');

  // 1. Linescore data calculation
  const awayLinescores = awayTeam?.linescores || [];
  const homeLinescores = homeTeam?.linescores || [];
  const periodCount = Math.max(awayLinescores.length, homeLinescores.length);

  // 2. Player Rosters (Soccer format from rosters array)
  const rosters = matchData.rosters || [];
  const awayRosterGroup = rosters.find(
    (r) => r.homeAway === 'away' || r.team?.id === awayTeam?.id
  ) || rosters[0];
  const homeRosterGroup = rosters.find(
    (r) => r.homeAway === 'home' || r.team?.id === homeTeam?.id
  ) || rosters[1];

  const currentRosterGroup = selectedTeamTab === 'away' ? awayRosterGroup : homeRosterGroup;
  const currentTeamInfo = selectedTeamTab === 'away' ? awayTeam : homeTeam;

  // 3. American Sports Boxscore Players (from boxscore.players)
  const boxPlayers = matchData.boxscore?.players || [];
  const currentBoxPlayerGroup = boxPlayers.find(
    (bp) =>
      bp.team?.id === currentTeamInfo?.id ||
      bp.team?.displayName?.toLowerCase() === currentTeamInfo?.displayName?.toLowerCase()
  ) || (selectedTeamTab === 'away' ? boxPlayers[0] : boxPlayers[1]);

  // If soccer roster is available
  const soccerRosterList: PlayerRosterItem[] = currentRosterGroup?.roster || [];

  // Filter soccer roster
  const filteredSoccerPlayers = soccerRosterList.filter((p) => {
    if (lineupFilter === 'starters' && !p.starter) return false;
    if (lineupFilter === 'bench' && p.starter) return false;
    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase();
      const name = (p.athlete.displayName || p.athlete.fullName || '').toLowerCase();
      const pos = (p.position?.name || p.position?.displayName || '').toLowerCase();
      const num = String(p.jersey || '');
      return name.includes(q) || pos.includes(q) || num.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Linescore / Period Box Score Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Linescore Summary</span>
          </h3>
          <span className="text-xs text-neutral-400">Official Period Breakdown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="pb-2.5 font-semibold text-neutral-300">Team</th>
                {Array.from({ length: periodCount }).map((_, i) => (
                  <th key={i} className="pb-2.5 text-center font-semibold w-10">
                    {i + 1}
                  </th>
                ))}
                <th className="pb-2.5 text-center font-bold text-white w-14">T</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {/* Away Team Row */}
              <tr className="hover:bg-neutral-850/50 transition-colors">
                <td className="py-3 flex items-center gap-2 font-medium text-white">
                  <TeamLogo team={awayTeam} size="sm" />
                  <span className="truncate max-w-[140px] sm:max-w-none">
                    {awayTeam?.displayName || awayTeam?.team?.displayName || 'Away Team'}
                  </span>
                  {awayTeam?.winner && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 font-bold border border-emerald-800">
                      W
                    </span>
                  )}
                </td>
                {Array.from({ length: periodCount }).map((_, i) => {
                  const scoreVal = awayLinescores[i]?.displayValue ?? awayLinescores[i]?.value ?? '-';
                  return (
                    <td key={i} className="py-3 text-center text-neutral-300 font-mono">
                      {scoreVal}
                    </td>
                  );
                })}
                <td className="py-3 text-center font-bold text-white text-sm font-mono">
                  {awayTeam?.score || 0}
                </td>
              </tr>

              {/* Home Team Row */}
              <tr className="hover:bg-neutral-850/50 transition-colors">
                <td className="py-3 flex items-center gap-2 font-medium text-white">
                  <TeamLogo team={homeTeam} size="sm" />
                  <span className="truncate max-w-[140px] sm:max-w-none">
                    {homeTeam?.displayName || homeTeam?.team?.displayName || 'Home Team'}
                  </span>
                  {homeTeam?.winner && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 font-bold border border-emerald-800">
                      W
                    </span>
                  )}
                </td>
                {Array.from({ length: periodCount }).map((_, i) => {
                  const scoreVal = homeLinescores[i]?.displayValue ?? homeLinescores[i]?.value ?? '-';
                  return (
                    <td key={i} className="py-3 text-center text-neutral-300 font-mono">
                      {scoreVal}
                    </td>
                  );
                })}
                <td className="py-3 text-center font-bold text-white text-sm font-mono">
                  {homeTeam?.score || 0}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Player Statistics Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        {/* Header & Team Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-bold text-white">Detailed Player Statistics</h3>
          </div>

          {/* Team Switcher Buttons */}
          <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setSelectedTeamTab('away')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                selectedTeamTab === 'away'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <TeamLogo team={awayTeam} size="sm" />
              <span>{awayTeam?.abbreviation || awayTeam?.displayName || 'Away Team'}</span>
            </button>
            <button
              onClick={() => setSelectedTeamTab('home')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                selectedTeamTab === 'home'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <TeamLogo team={homeTeam} size="sm" />
              <span>{homeTeam?.abbreviation || homeTeam?.displayName || 'Home Team'}</span>
            </button>
          </div>
        </div>

        {/* Formation & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            {currentRosterGroup?.formation && (
              <span className="px-2.5 py-1 rounded bg-neutral-950 text-neutral-300 border border-neutral-800 text-xs font-mono font-medium">
                Formation: {currentRosterGroup.formation}
              </span>
            )}
            <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setLineupFilter('all')}
                className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
                  lineupFilter === 'all'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                All Squad
              </button>
              <button
                onClick={() => setLineupFilter('starters')}
                className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
                  lineupFilter === 'starters'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Starters
              </button>
              <button
                onClick={() => setLineupFilter('bench')}
                className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
                  lineupFilter === 'bench'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Bench / Subs
              </button>
            </div>
          </div>

          {/* Player Search Input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search athlete by name..."
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Player Stats Table (Soccer format) */}
        {soccerRosterList.length > 0 ? (
          <div className="overflow-x-auto border border-neutral-800 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Player</th>
                  <th className="py-2.5 px-3 w-16">Pos</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-2 text-center" title="Total Goals">
                    G
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Assists">
                    A
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Total Shots">
                    SH
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Shots on Goal">
                    SOG
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Fouls Committed">
                    FC
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Fouls Suffered">
                    FS
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Yellow Cards">
                    YC
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Red Cards">
                    RC
                  </th>
                  <th className="py-2.5 px-2 text-center" title="Saves">
                    SV
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredSoccerPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-6 text-center text-neutral-500">
                      No players match your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredSoccerPlayers.map((item, idx) => {
                    // Helper to get stat value
                    const getStat = (name: string) => {
                      const st = item.stats?.find(
                        (s) => s.name?.toLowerCase() === name.toLowerCase()
                      );
                      return st?.displayValue || '0';
                    };

                    const goals = getStat('totalGoals');
                    const assists = getStat('goalAssists');
                    const shots = getStat('totalShots');
                    const sog = getStat('shotsOnTarget');
                    const fouls = getStat('foulsCommitted');
                    const foulsSuff = getStat('foulsSuffered');
                    const yellowCards = getStat('yellowCards');
                    const redCards = getStat('redCards');
                    const saves = getStat('saves');

                    return (
                      <tr
                        key={item.athlete?.id || idx}
                        className="hover:bg-neutral-850/60 transition-colors"
                      >
                        <td className="py-2.5 px-3 text-center font-mono text-neutral-400">
                          {item.jersey || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-white flex items-center gap-2">
                          <span className="truncate">{item.athlete?.displayName || item.athlete?.fullName}</span>
                          {parseInt(goals) > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[10px] font-bold border border-emerald-800">
                              ⚽ {goals}
                            </span>
                          )}
                          {parseInt(yellowCards) > 0 && (
                            <span className="w-2.5 h-3.5 rounded-xs bg-amber-400 inline-block shrink-0" title="Yellow Card" />
                          )}
                          {parseInt(redCards) > 0 && (
                            <span className="w-2.5 h-3.5 rounded-xs bg-red-600 inline-block shrink-0" title="Red Card" />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-400 font-medium">
                          {item.position?.abbreviation || item.position?.displayName || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.starter ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-800 text-neutral-300">
                              Starter
                            </span>
                          ) : item.subbedIn ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
                              Sub In
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-950 text-neutral-500">
                              Bench
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-white font-semibold">
                          {goals}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-300">
                          {assists}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-300">
                          {shots}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-300">
                          {sog}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-400">
                          {fouls}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-400">
                          {foulsSuff}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-amber-400">
                          {yellowCards}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-red-400">
                          {redCards}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-300">
                          {saves}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : currentBoxPlayerGroup?.statistics && currentBoxPlayerGroup.statistics.length > 0 ? (
          /* American Sports Boxscore Players (e.g. Baseball Batting/Pitching, Football Passing/Rushing) */
          <div className="space-y-6">
            {currentBoxPlayerGroup.statistics.map((statCategory, catIdx) => {
              const labels = statCategory.labels || [];
              const athletes = (statCategory.athletes || []).filter((ath) => {
                if (!playerSearch.trim()) return true;
                const name = ath.athlete?.displayName?.toLowerCase() || '';
                return name.includes(playerSearch.toLowerCase());
              });

              return (
                <div key={catIdx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                      {statCategory.type || 'Player Statistics'}
                    </h4>
                  </div>
                  <div className="overflow-x-auto border border-neutral-800 rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
                        <tr>
                          <th className="py-2.5 px-3">Athlete</th>
                          <th className="py-2.5 px-3 w-16">Pos</th>
                          {labels.map((lbl, lIdx) => (
                            <th key={lIdx} className="py-2.5 px-2 text-center">
                              {lbl}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60">
                        {athletes.map((ath, aIdx) => (
                          <tr
                            key={ath.athlete?.id || aIdx}
                            className="hover:bg-neutral-850/60 transition-colors"
                          >
                            <td className="py-2 px-3 font-medium text-white flex items-center gap-2">
                              {ath.athlete?.headshot?.href && (
                                <img
                                  src={ath.athlete.headshot.href}
                                  alt=""
                                  className="w-5 h-5 rounded-full object-cover bg-neutral-800"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <span>{ath.athlete?.displayName || ath.athlete?.shortName}</span>
                            </td>
                            <td className="py-2 px-3 text-neutral-400">
                              {ath.position?.abbreviation || ath.athlete?.position?.abbreviation || '-'}
                            </td>
                            {(ath.stats || []).map((val, sIdx) => (
                              <td key={sIdx} className="py-2 px-2 text-center font-mono text-neutral-300">
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-neutral-400 text-sm">
            Detailed player statistics are being aggregated from ESPN boxscore.
          </div>
        )}
      </div>
    </div>
  );
};
