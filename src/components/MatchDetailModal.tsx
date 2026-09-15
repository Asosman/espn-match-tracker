import React, { useState, useEffect } from 'react';
import {
  X,
  BarChart2,
  FileText,
  Users,
  Activity,
  Server,
  Calendar,
  MapPin,
  CloudSun,
  Shield,
  Clock,
  RefreshCw,
  Radio,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { MatchEventSummary, ComprehensiveMatchData } from '../types';
import { fetchComprehensiveMatch } from '../services/espn';
import { extractMatchHighlights } from '../utils/eventHelpers';
import { GraphicalComparison } from './GraphicalComparison';
import { PlayByPlayView } from './PlayByPlayView';
import { BoxScorePlayerStats } from './BoxScorePlayerStats';
import { LiveTriggerEngine } from './LiveTriggerEngine';
import { EndpointsInspector } from './EndpointsInspector';

import { TeamLogo } from './MatchCard';

interface MatchDetailModalProps {
  match: MatchEventSummary;
  onClose: () => void;
  isMonitored?: boolean;
  onToggleMonitor?: (matchId: string, e?: React.MouseEvent) => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  onClose,
  isMonitored = false,
  onToggleMonitor,
}) => {
  const [activeTab, setActiveTab] = useState<
    'comparison' | 'boxscore' | 'plays' | 'triggers' | 'story' | 'endpoints'
  >('comparison');
  const [matchData, setMatchData] = useState<ComprehensiveMatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const comp = match.competitions?.[0];
  const competitors = comp?.competitors || [];
  const homeTeam =
    competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayTeam =
    competitors.find((c) => c.homeAway === 'away') || competitors[1];

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchComprehensiveMatch(match.sport, match.league, match.id, match);
      setMatchData(data);
    } catch (err: any) {
      console.error('Error fetching comprehensive match data:', err);
      setError(err.message || 'Failed to fetch match details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [match.id, match.sport, match.league]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const venue = comp?.venue;
  const matchDate = new Date(match.date);
  const formattedDate = matchDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = matchDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="match-detail-modal-container"
        className="relative w-full max-w-5xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Top Header with Scoreboard Banner */}
        <div className="bg-neutral-900 border-b border-neutral-800 p-4 sm:p-6 shrink-0">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
              <span className="text-red-400 uppercase tracking-wider">{match.league}</span>
              <span>•</span>
              <span className="capitalize">{match.sport}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formattedDate} {formattedTime}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onToggleMonitor && (
                <button
                  type="button"
                  id="btn-modal-toggle-monitor"
                  onClick={(e) => onToggleMonitor(match.id, e)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isMonitored
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700'
                  }`}
                  title={isMonitored ? 'Stop monitoring this match' : 'Monitor this match for live events'}
                >
                  <Radio className={`w-3.5 h-3.5 ${isMonitored ? 'animate-pulse text-white' : 'text-neutral-400'}`} />
                  <span>{isMonitored ? 'Monitored' : 'Monitor Match'}</span>
                </button>
              )}

              <button
                onClick={loadData}
                disabled={loading}
                title="Refresh match data"
                className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-400' : ''}`} />
              </button>
              <button
                id="btn-close-modal"
                onClick={onClose}
                className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Teams & Score Card (Home on Left, Away on Right) */}
          <div className="grid grid-cols-3 items-center gap-4 text-center">
            {/* Home Team */}
            <div className="flex flex-col items-center sm:items-start sm:flex-row gap-3 text-left">
              <TeamLogo team={homeTeam} size="lg" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Home
                </span>
                <h2 className="text-base sm:text-xl font-bold text-white leading-tight truncate">
                  {homeTeam?.displayName || homeTeam?.team?.displayName || 'Home Team'}
                </h2>
                {homeTeam?.records?.[0]?.summary && (
                  <span className="text-xs text-neutral-400">
                    {homeTeam.records[0].summary}
                  </span>
                )}
              </div>
            </div>

            {/* Score & Status Center */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
                {homeTeam?.score !== undefined ? homeTeam.score : '-'} :{' '}
                {awayTeam?.score !== undefined ? awayTeam.score : '-'}
              </div>
              <span className="mt-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-neutral-800 text-neutral-200 border border-neutral-700">
                {match.status?.type?.detail || match.status?.type?.shortDetail || 'Final'}
              </span>
            </div>

            {/* Away Team */}
            <div className="flex flex-col items-center sm:items-end sm:flex-row-reverse gap-3 text-right">
              <TeamLogo team={awayTeam} size="lg" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Away
                </span>
                <h2 className="text-base sm:text-xl font-bold text-white leading-tight truncate">
                  {awayTeam?.displayName || awayTeam?.team?.displayName || 'Away Team'}
                </h2>
                {awayTeam?.records?.[0]?.summary && (
                  <span className="text-xs text-neutral-400">
                    {awayTeam.records[0].summary}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Structured Event Highlights: Halftime/Fulltime, Scorers, Assists, Disallowed, Red Cards */}
          {(() => {
            const hl = extractMatchHighlights(match, matchData);
            const hasAny =
              hl.timing.halftime ||
              hl.timing.fulltime ||
              hl.goals.length > 0 ||
              hl.disallowedGoals.length > 0 ||
              hl.penaltiesMissed.length > 0 ||
              hl.redCards.length > 0;

            if (!hasAny) return null;

            return (
              <div className="mt-4 p-3 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-2">
                {/* Halftime and Fulltime Scores */}
                {(hl.timing.halftime || hl.timing.fulltime) && (
                  <div className="flex items-center gap-4 text-xs font-mono text-neutral-300 pb-2 border-b border-neutral-800/80">
                    {hl.timing.halftime && (
                      <span className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] font-bold text-neutral-400">HT</span>
                        <strong className="text-white">{hl.timing.halftime.home} - {hl.timing.halftime.away}</strong>
                      </span>
                    )}
                    {hl.timing.fulltime && (
                      <span className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] font-bold text-neutral-400">FT</span>
                        <strong className="text-white">{hl.timing.fulltime.home} - {hl.timing.fulltime.away}</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Key Match Events Badges */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {hl.goals.map((g, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs"
                    >
                      <span>⚽</span>
                      <strong className="font-semibold">{g.scorer}</strong>
                      {g.assist && (
                        <span className="text-neutral-400 text-[11px]">
                          (assist: {g.assist})
                        </span>
                      )}
                      {g.minute && (
                        <span className="text-[10px] font-mono text-neutral-500">{g.minute}</span>
                      )}
                    </span>
                  ))}

                  {hl.penaltiesScored.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs"
                    >
                      <span>🥅</span>
                      <span>Penalty Scored: <strong>{p.player || 'Player'}</strong></span>
                      {p.minute && <span className="text-[10px] font-mono text-emerald-500">{p.minute}</span>}
                    </span>
                  ))}

                  {hl.penaltiesMissed.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs"
                    >
                      <span>❌</span>
                      <span>Penalty Missed: <strong>{p.player || 'Player'}</strong></span>
                      {p.minute && <span className="text-[10px] font-mono text-amber-500">{p.minute}</span>}
                    </span>
                  ))}

                  {hl.disallowedGoals.map((d, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-800/70 text-rose-300 text-xs"
                    >
                      <span>🚨</span>
                      <span>Disallowed: <strong>{d.player || 'Goal'}</strong> ({d.reason || 'VAR'})</span>
                      {d.minute && <span className="text-[10px] font-mono text-rose-400">{d.minute}</span>}
                    </span>
                  ))}

                  {hl.redCards.map((rc, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/50 border border-red-800/70 text-red-300 text-xs"
                    >
                      <span className="w-2.5 h-3.5 bg-red-600 rounded-[2px] inline-block"></span>
                      <span>Red Card: <strong>{rc.player}</strong>{rc.isSecondYellow ? ' (2nd Yellow)' : ''}</span>
                      {rc.minute && <span className="text-[10px] font-mono text-red-400">{rc.minute}</span>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Venue & Game details strip */}
          <div className="mt-4 pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-between text-xs text-neutral-400 gap-2">
            <div className="flex items-center gap-1.5 truncate">
              {venue?.fullName && (
                <>
                  <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span>
                    {venue.fullName}
                    {venue.address?.city ? `, ${venue.address.city}` : ''}
                  </span>
                </>
              )}
            </div>

            {comp?.attendance && (
              <span className="text-neutral-400 font-mono">
                Attendance: {comp.attendance.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6 bg-neutral-900/60 border-b border-neutral-800 shrink-0">
          <button
            id="tab-graphical-comparison"
            onClick={() => setActiveTab('comparison')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'border-red-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>Team Comparisons</span>
          </button>

          <button
            id="tab-boxscores"
            onClick={() => setActiveTab('boxscore')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'boxscore'
                ? 'border-red-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Box Scores & Players</span>
          </button>

          <button
            id="tab-play-by-play"
            onClick={() => setActiveTab('plays')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'plays'
                ? 'border-red-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Play-by-Play Logs</span>
          </button>

          <button
            id="tab-live-triggers"
            onClick={() => setActiveTab('triggers')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'triggers'
                ? 'border-red-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Live Update Triggers</span>
          </button>

          <button
            id="tab-match-story"
            onClick={() => setActiveTab('story')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'story'
                ? 'border-red-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Match Story</span>
          </button>

          <button
            id="tab-endpoints"
            onClick={() => setActiveTab('endpoints')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'endpoints'
                ? 'border-red-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4 text-cyan-400" />
            <span>ESPN Endpoints</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-red-500 animate-spin mx-auto" />
              <p className="text-sm font-medium text-neutral-300">
                Synchronizing match data across ESPN endpoints...
              </p>
              <p className="text-xs text-neutral-500 font-mono">
                Querying SITE_BASE, CORE_BASE, CDN_BASE & SITE_V3_BASE
              </p>
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-red-400 text-sm font-medium">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-500"
              >
                Retry Request
              </button>
            </div>
          ) : matchData ? (
            <>
              {activeTab === 'comparison' && (
                <GraphicalComparison matchData={matchData} />
              )}
              {activeTab === 'boxscore' && (
                <BoxScorePlayerStats matchData={matchData} />
              )}
              {activeTab === 'plays' && (
                <PlayByPlayView matchData={matchData} />
              )}
              {activeTab === 'triggers' && (
                <LiveTriggerEngine matchData={matchData} />
              )}
              {activeTab === 'story' && (
                <div className="space-y-6">
                  {/* Article Headline & Story */}
                  {matchData.article ? (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-4">
                      {matchData.article.headline && (
                        <h3 className="text-xl font-bold text-white leading-snug">
                          {matchData.article.headline}
                        </h3>
                      )}
                      {matchData.article.description && (
                        <p className="text-sm font-medium text-neutral-300 leading-relaxed italic border-l-2 border-red-500 pl-3">
                          {matchData.article.description}
                        </p>
                      )}
                      {matchData.article.story && (
                        <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-line pt-2">
                          {matchData.article.story}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-400 text-sm">
                      Official post-match editorial report is being prepared. Check box scores and play logs for immediate breakdown.
                    </div>
                  )}

                  {/* Match Officials & Weather */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {matchData.gameInfo?.weather && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-blue-950/80 border border-blue-800 text-blue-300">
                          <CloudSun className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-400 font-semibold">Conditions</div>
                          <div className="text-sm font-bold text-white">
                            {matchData.gameInfo.weather.displayValue ||
                              `${matchData.gameInfo.weather.temperature}°F`}
                          </div>
                        </div>
                      </div>
                    )}

                    {matchData.gameInfo?.officials && matchData.gameInfo.officials.length > 0 && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300">
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-400 font-semibold">Match Official</div>
                          <div className="text-sm font-bold text-white">
                            {matchData.gameInfo.officials[0]?.displayName}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'endpoints' && (
                <EndpointsInspector matchData={matchData} />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
