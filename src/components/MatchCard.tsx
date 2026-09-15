import React, { useState } from 'react';
import {
  ChevronRight,
  Clock,
  MapPin,
  Radio,
  Shield,
  Trophy,
  AlertTriangle,
  Flame,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { MatchEventSummary, TeamCompetitor } from '../types';
import { extractMatchHighlights } from '../utils/eventHelpers';

interface MatchCardProps {
  match: MatchEventSummary;
  leagueDisplayName: string;
  sportDisplayName?: string;
  onSelectMatch: (match: MatchEventSummary) => void;
  isMonitored?: boolean;
  onToggleMonitor?: (matchId: string, e: React.MouseEvent) => void;
}

export const TeamLogo: React.FC<{
  team?: TeamCompetitor;
  size?: 'sm' | 'md' | 'lg';
}> = ({ team, size = 'sm' }) => {
  const [imgError, setImgError] = useState(false);

  const teamId = team?.id || team?.team?.id;
  const name = team?.displayName || team?.team?.displayName || team?.name || 'FC';
  const abbreviation =
    team?.abbreviation ||
    team?.team?.abbreviation ||
    name.slice(0, 3).toUpperCase();

  // Try team.logo, team.team.logo, or ESPN CDN soccer URL
  const logoUrl =
    !imgError &&
    (team?.logo ||
      team?.team?.logo ||
      (teamId ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png` : ''));

  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-14 h-14 sm:w-16 sm:h-16 text-sm',
  }[size];

  if (!logoUrl || imgError) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-neutral-300 shrink-0 select-none shadow-sm`}
        title={name}
      >
        {abbreviation.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      onError={() => setImgError(true)}
      className={`${sizeClasses} object-contain shrink-0 p-0.5 rounded-full bg-neutral-900 border border-neutral-800 shadow-sm`}
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
};

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  leagueDisplayName,
  onSelectMatch,
  isMonitored = false,
  onToggleMonitor,
}) => {
  const comp = match.competitions?.[0];
  const competitors = comp?.competitors || [];

  // Home and away teams with robust fallbacks
  const homeTeam =
    competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayTeam =
    competitors.find((c) => c.homeAway === 'away') || competitors[1];

  const statusType = match.status?.type;
  const isCompleted = statusType?.completed || statusType?.state === 'post';
  const isLive = statusType?.state === 'in';
  const statusDetail =
    match.status?.displayClock ||
    match.status?.type?.shortDetail ||
    match.status?.type?.detail ||
    (isCompleted ? 'FT' : 'Scheduled');

  // Format date/time
  const matchDate = new Date(match.date);
  const timeFormatted = matchDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const venueName = comp?.venue?.fullName;

  // Home and Away names
  const homeName =
    homeTeam?.displayName || homeTeam?.team?.displayName || 'Home Team';
  const awayName =
    awayTeam?.displayName || awayTeam?.team?.displayName || 'Away Team';

  // Extract structured match highlights
  const highlights = extractMatchHighlights(match);
  const { goals, disallowedGoals, penaltiesScored, penaltiesMissed, redCards, timing } = highlights;

  return (
    <div
      id={`match-card-${match.id}`}
      onClick={() => onSelectMatch(match)}
      className={`group relative bg-neutral-900/95 border rounded-xl p-4 transition-all duration-150 hover:shadow-lg hover:shadow-black/50 cursor-pointer flex flex-col justify-between ${
        isMonitored
          ? 'border-emerald-700/80 bg-gradient-to-b from-neutral-900 via-neutral-900 to-emerald-950/20 ring-1 ring-emerald-600/40'
          : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
      }`}
    >
      {/* Card Header: League, Status & Monitor Button */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
          <span className="text-neutral-200 font-semibold truncate">
            {leagueDisplayName || match.league || 'Football'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Monitor Button */}
          {onToggleMonitor && (
            <button
              type="button"
              id={`btn-monitor-${match.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMonitor(match.id, e);
              }}
              title={isMonitored ? 'Click to stop monitoring this match' : 'Click to monitor this match for live triggers & events'}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                isMonitored
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50 hover:bg-emerald-500'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700'
              }`}
            >
              <Radio className={`w-3 h-3 ${isMonitored ? 'animate-pulse text-white' : 'text-neutral-400'}`} />
              <span>{isMonitored ? 'Monitored' : 'Monitor'}</span>
            </button>
          )}

          {/* Status Badge */}
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              {statusDetail}
            </span>
          ) : isCompleted ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
              {statusDetail === 'STATUS_FINAL' ? 'FT' : statusDetail}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-800/80 text-neutral-300 border border-neutral-700/80">
              <Clock className="w-3 h-3 text-neutral-400" />
              {timeFormatted}
            </span>
          )}
        </div>
      </div>

      {/* Teams & Scores */}
      <div className="space-y-2.5 my-1.5">
        {/* Home Team */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamLogo team={homeTeam} size="sm" />
            <div className="truncate">
              <span
                className={`text-sm font-semibold truncate block ${
                  homeTeam?.winner
                    ? 'text-white'
                    : isCompleted
                    ? 'text-neutral-300'
                    : 'text-neutral-100'
                }`}
              >
                {homeName}
              </span>
              {homeTeam?.records?.[0]?.summary && (
                <span className="text-[11px] text-neutral-500 font-normal">
                  {homeTeam.records[0].summary}
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`text-lg font-bold tabular-nums ${
                homeTeam?.winner
                  ? 'text-white font-extrabold'
                  : isCompleted
                  ? 'text-neutral-300'
                  : isLive
                  ? 'text-white'
                  : 'text-neutral-400'
              }`}
            >
              {homeTeam?.score !== undefined && homeTeam?.score !== ''
                ? homeTeam.score
                : '-'}
            </span>
          </div>
        </div>

        {/* Away Team */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamLogo team={awayTeam} size="sm" />
            <div className="truncate">
              <span
                className={`text-sm font-semibold truncate block ${
                  awayTeam?.winner
                    ? 'text-white'
                    : isCompleted
                    ? 'text-neutral-300'
                    : 'text-neutral-100'
                }`}
              >
                {awayName}
              </span>
              {awayTeam?.records?.[0]?.summary && (
                <span className="text-[11px] text-neutral-500 font-normal">
                  {awayTeam.records[0].summary}
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`text-lg font-bold tabular-nums ${
                awayTeam?.winner
                  ? 'text-white font-extrabold'
                  : isCompleted
                  ? 'text-neutral-300'
                  : isLive
                  ? 'text-white'
                  : 'text-neutral-400'
              }`}
            >
              {awayTeam?.score !== undefined && awayTeam?.score !== ''
                ? awayTeam.score
                : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Halftime and Fulltime Breakdown */}
      {(timing.halftime || timing.fulltime) && (
        <div className="my-1.5 py-1 px-2.5 bg-neutral-950/80 rounded-md border border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
          <div className="flex items-center gap-3">
            {timing.halftime && (
              <span className="inline-flex items-center gap-1 text-neutral-300">
                <span className="text-[10px] font-bold px-1 py-0.2 bg-neutral-800 rounded text-neutral-400">HT</span>
                <span className="font-semibold text-white">
                  {timing.halftime.home} - {timing.halftime.away}
                </span>
              </span>
            )}
            {timing.fulltime && (
              <span className="inline-flex items-center gap-1 text-neutral-300 border-l border-neutral-800 pl-3">
                <span className="text-[10px] font-bold px-1 py-0.2 bg-neutral-800 rounded text-neutral-400">FT</span>
                <span className="font-semibold text-white">
                  {timing.fulltime.home} - {timing.fulltime.away}
                </span>
              </span>
            )}
          </div>

          {isLive && (
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-sans font-bold">
              {timing.isHalftime ? 'Half Time Break' : timing.isSecondHalf ? '2nd Half' : '1st Half'}
            </span>
          )}
        </div>
      )}

      {/* MATCH KEY EVENTS SECTION: Goal scorers, Assists, Disallowed, Penalties, Red Cards */}
      {(goals.length > 0 || disallowedGoals.length > 0 || penaltiesMissed.length > 0 || redCards.length > 0) && (
        <div className="my-2 p-2 bg-neutral-950/90 rounded-lg border border-neutral-800/90 space-y-1.5 text-xs">
          {/* Goal Scorers & Assist Names */}
          {goals.map((g, idx) => (
            <div key={`goal-${idx}`} className="flex items-center justify-between text-[11px] gap-2">
              <div className="flex items-center gap-1.5 truncate">
                <span>⚽</span>
                <span className="font-semibold text-neutral-100 truncate">
                  {g.scorer}
                  {g.ownGoal ? ' (OG)' : ''}
                </span>
                {g.assist && (
                  <span className="text-neutral-400 text-[10px] truncate">
                    (assist: <strong className="text-neutral-300 font-normal">{g.assist}</strong>)
                  </span>
                )}
              </div>
              {g.minute && (
                <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                  {g.minute}
                </span>
              )}
            </div>
          ))}

          {/* Penalties Scored (highlighted) */}
          {penaltiesScored.map((p, idx) => (
            <div key={`pen-scored-${idx}`} className="flex items-center justify-between text-[11px] gap-2 text-emerald-400">
              <div className="flex items-center gap-1.5 truncate">
                <span>🥅</span>
                <span className="font-semibold truncate">
                  Penalty Scored: {p.player || 'Player'}
                </span>
              </div>
              {p.minute && (
                <span className="text-[10px] text-emerald-500/80 font-mono shrink-0">
                  {p.minute}
                </span>
              )}
            </div>
          ))}

          {/* Penalties Missed */}
          {penaltiesMissed.map((p, idx) => (
            <div key={`pen-missed-${idx}`} className="flex items-center justify-between text-[11px] gap-2 text-amber-400">
              <div className="flex items-center gap-1.5 truncate">
                <span>❌</span>
                <span className="font-semibold truncate">
                  Penalty Missed: {p.player || 'Player'}
                </span>
              </div>
              {p.minute && (
                <span className="text-[10px] text-amber-500/80 font-mono shrink-0">
                  {p.minute}
                </span>
              )}
            </div>
          ))}

          {/* Goals Disallowed */}
          {disallowedGoals.map((d, idx) => (
            <div key={`disallowed-${idx}`} className="flex items-center justify-between text-[11px] gap-2 text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/40">
              <div className="flex items-center gap-1.5 truncate">
                <span>🚨</span>
                <span className="font-semibold truncate">
                  Goal Disallowed: {d.player || 'VAR'}
                </span>
                {d.reason && d.reason !== d.player && (
                  <span className="text-[10px] text-rose-300/80 truncate">
                    ({d.reason})
                  </span>
                )}
              </div>
              {d.minute && (
                <span className="text-[10px] text-rose-400/80 font-mono shrink-0">
                  {d.minute}
                </span>
              )}
            </div>
          ))}

          {/* Red Cards with Player Name */}
          {redCards.map((rc, idx) => (
            <div key={`red-${idx}`} className="flex items-center justify-between text-[11px] gap-2 text-red-400 bg-red-950/30 px-1.5 py-0.5 rounded border border-red-900/40">
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2.5 h-3.5 bg-red-600 rounded-[2px] inline-block shrink-0 shadow-sm"></span>
                <span className="font-bold text-red-200 truncate">
                  Red Card: {rc.player}
                  {rc.isSecondYellow ? ' (2nd Yellow)' : ''}
                </span>
              </div>
              {rc.minute && (
                <span className="text-[10px] text-red-400/80 font-mono shrink-0">
                  {rc.minute}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card Footer */}
      <div className="pt-2.5 mt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
          {venueName ? (
            <>
              <MapPin className="w-3 h-3 text-neutral-500 shrink-0" />
              <span className="truncate text-[11px] text-neutral-400">{venueName}</span>
            </>
          ) : (
            <span className="text-[11px] text-neutral-500">
              {isCompleted ? 'Full Time Result' : `Kickoff: ${timeFormatted}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-red-400 group-hover:text-red-300 font-medium text-xs shrink-0">
          <span>Match Events</span>
          <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};
