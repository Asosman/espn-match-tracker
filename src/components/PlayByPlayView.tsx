import React, { useState } from 'react';
import {
  Clock,
  Filter,
  Search,
  AlertCircle,
  Flag,
  RotateCcw,
  Trophy,
  ArrowUpDown,
  Zap,
} from 'lucide-react';
import { ComprehensiveMatchData, PlayByPlayItem } from '../types';

interface PlayByPlayViewProps {
  matchData: ComprehensiveMatchData;
}

export const PlayByPlayView: React.FC<PlayByPlayViewProps> = ({ matchData }) => {
  const [filterType, setFilterType] = useState<'all' | 'scoring' | 'discipline' | 'subs'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Combine commentary, keyEvents, and plays
  const rawPlays = [
    ...(matchData.commentary || []),
    ...(matchData.keyEvents || []),
    ...(matchData.plays || []),
  ];

  // Remove duplicates by id or text+time
  const seenKeys = new Set<string>();
  const uniquePlays: PlayByPlayItem[] = [];

  rawPlays.forEach((p, index) => {
    const key = p.id || `${p.time?.displayValue || p.clock?.displayValue}_${p.text?.slice(0, 30)}_${index}`;
    if (!seenKeys.has(key) && p.text) {
      seenKeys.add(key);
      uniquePlays.push(p);
    }
  });

  // Filter plays
  const filteredPlays = uniquePlays.filter((play) => {
    const textLower = (play.text || '').toLowerCase();
    const typeText = (play.type?.text || '').toLowerCase();

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!textLower.includes(q) && !typeText.includes(q)) {
        return false;
      }
    }

    if (filterType === 'scoring') {
      return (
        play.scoringPlay ||
        textLower.includes('goal') ||
        textLower.includes('touchdown') ||
        textLower.includes('home run') ||
        textLower.includes('scores') ||
        textLower.includes('three point')
      );
    }
    if (filterType === 'discipline') {
      return (
        textLower.includes('yellow card') ||
        textLower.includes('red card') ||
        textLower.includes('foul') ||
        textLower.includes('penalty') ||
        textLower.includes('ejection')
      );
    }
    if (filterType === 'subs') {
      return (
        textLower.includes('substitution') ||
        textLower.includes('subbed in') ||
        textLower.includes('replaces') ||
        textLower.includes('pitching change')
      );
    }

    return true;
  });

  // Sort
  const sortedPlays = [...filteredPlays].sort((a, b) => {
    const timeA = parseInt(a.time?.displayValue || a.clock?.displayValue || '0', 10) || 0;
    const timeB = parseInt(b.time?.displayValue || b.clock?.displayValue || '0', 10) || 0;
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  // Helper to determine event icon & accent color
  const getEventBadge = (play: PlayByPlayItem) => {
    const t = (play.text || '').toLowerCase();
    if (t.includes('goal') || t.includes('touchdown') || t.includes('home run') || play.scoringPlay) {
      return {
        icon: <Trophy className="w-4 h-4 text-emerald-400" />,
        bg: 'bg-emerald-950/70 border-emerald-700/80 text-emerald-300',
        label: 'Scoring Play',
      };
    }
    if (t.includes('red card')) {
      return {
        icon: <AlertCircle className="w-4 h-4 text-red-500" />,
        bg: 'bg-red-950/70 border-red-700/80 text-red-300',
        label: 'Red Card',
      };
    }
    if (t.includes('yellow card')) {
      return {
        icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
        bg: 'bg-amber-950/70 border-amber-700/80 text-amber-300',
        label: 'Yellow Card',
      };
    }
    if (t.includes('substitution') || t.includes('replaces')) {
      return {
        icon: <RotateCcw className="w-4 h-4 text-cyan-400" />,
        bg: 'bg-cyan-950/70 border-cyan-700/80 text-cyan-300',
        label: 'Substitution',
      };
    }
    if (t.includes('corner')) {
      return {
        icon: <Flag className="w-4 h-4 text-indigo-400" />,
        bg: 'bg-indigo-950/70 border-indigo-700/80 text-indigo-300',
        label: 'Corner Kick',
      };
    }
    return {
      icon: <Clock className="w-4 h-4 text-neutral-400" />,
      bg: 'bg-neutral-800/80 border-neutral-700/80 text-neutral-300',
      label: play.type?.text || 'Play Event',
    };
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filterType === 'all'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            All Logs ({uniquePlays.length})
          </button>
          <button
            onClick={() => setFilterType('scoring')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filterType === 'scoring'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            Goals & Scoring
          </button>
          <button
            onClick={() => setFilterType('discipline')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filterType === 'discipline'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            Cards & Fouls
          </button>
          <button
            onClick={() => setFilterType('subs')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filterType === 'subs'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            Substitutions
          </button>
        </div>

        {/* Search Input & Sort Toggle */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search play text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title="Toggle Sort Order"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-medium transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {sortOrder === 'desc' ? 'Latest First' : 'Earliest First'}
            </span>
          </button>
        </div>
      </div>

      {/* Play List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        {sortedPlays.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-sm">
            No play-by-play events match the selected criteria.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {sortedPlays.map((play, index) => {
              const badge = getEventBadge(play);
              const timeDisplay =
                play.time?.displayValue ||
                play.clock?.displayValue ||
                (play.period?.displayValue ? `${play.period.displayValue}` : "Live");

              return (
                <div
                  key={play.id || index}
                  className={`p-4 hover:bg-neutral-850/60 transition-colors flex items-start gap-3.5 ${
                    play.scoringPlay ? 'bg-emerald-950/15' : ''
                  }`}
                >
                  {/* Timestamp Badge */}
                  <div className="w-14 shrink-0 text-center">
                    <span className="inline-block px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-200 font-mono font-bold text-xs">
                      {timeDisplay}
                    </span>
                    {play.period?.number && (
                      <span className="block text-[10px] text-neutral-500 font-medium mt-0.5">
                        P{play.period.number}
                      </span>
                    )}
                  </div>

                  {/* Icon Indicator */}
                  <div className={`p-2 rounded-lg border shrink-0 ${badge.bg}`}>
                    {badge.icon}
                  </div>

                  {/* Play Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-neutral-400">
                        {badge.label}
                      </span>
                      {play.awayScore !== undefined && play.homeScore !== undefined && (
                        <span className="text-xs font-bold text-neutral-300 font-mono bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                          {play.awayScore} - {play.homeScore}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-100 font-normal leading-relaxed">
                      {play.text}
                    </p>

                    {/* Participant athlete tags if available */}
                    {play.participants && play.participants.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {play.participants.map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className="inline-flex items-center px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-[11px] font-medium"
                          >
                            {part.athlete?.displayName || 'Player'}
                            {part.type && (
                              <span className="ml-1 text-neutral-400 text-[10px]">
                                ({part.type})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
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
