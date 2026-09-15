import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  Search,
  ChevronRight,
  Radio,
  Bell,
  Activity,
} from 'lucide-react';
import { fetchScoreboard, getWATDates } from './services/espn';
import { MatchEventSummary } from './types';
import { SUPPORTED_LEAGUES } from './utils/sportsConfig';
import { Header, ViewTab } from './components/Header';
import { MatchCard } from './components/MatchCard';
import { MatchDetailModal } from './components/MatchDetailModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('separated');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>('soccer-all-monitored');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMatch, setActiveMatch] = useState<MatchEventSummary | null>(null);

  const [yesterdayMatches, setYesterdayMatches] = useState<MatchEventSummary[]>([]);
  const [todayMatches, setTodayMatches] = useState<MatchEventSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // Track monitored matches
  const [monitoredMatchIds, setMonitoredMatchIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('espn_monitored_matches');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleMonitorMatch = useCallback((matchId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setMonitoredMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      try {
        localStorage.setItem('espn_monitored_matches', JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error('Failed to save monitored matches:', err);
      }
      return next;
    });
  }, []);

  const { todayDateStr, yesterdayDateStr, todayFormattedDisplay, yesterdayFormattedDisplay } =
    useMemo(() => getWATDates(), []);

  // Fetch both yesterday's and today's soccer matches from ESPN
  const loadMatches = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      setIsRefreshing(true);

      const targetLeague =
        selectedLeagueId === 'soccer-all-monitored' || selectedLeagueId === 'all'
          ? 'monitored-all'
          : SUPPORTED_LEAGUES.find((l) => l.id === selectedLeagueId)?.slug || 'monitored-all';

      try {
        // Fetch both yesterday and today scoreboards in parallel
        const [yesterdayRes, todayRes] = await Promise.allSettled([
          fetchScoreboard('soccer', targetLeague, yesterdayDateStr),
          fetchScoreboard('soccer', targetLeague, todayDateStr),
        ]);

        // Process Yesterday's events: Filter strictly for completed match results
        const rawYesterday =
          yesterdayRes.status === 'fulfilled' && yesterdayRes.value.events
            ? yesterdayRes.value.events
            : [];

        // Deduplicate & filter for completed/final match results
        const seenYesterday = new Set<string>();
        const filteredYesterday: MatchEventSummary[] = [];
        rawYesterday.forEach((ev) => {
          if (!seenYesterday.has(ev.id)) {
            seenYesterday.add(ev.id);
            // Completed or final match results
            const isCompleted =
              ev.status?.type?.completed || ev.status?.type?.state === 'post';
            if (isCompleted) {
              filteredYesterday.push(ev);
            }
          }
        });

        // Process Today's events: All matches scheduled or in progress for today
        const rawToday =
          todayRes.status === 'fulfilled' && todayRes.value.events
            ? todayRes.value.events
            : [];

        const seenToday = new Set<string>();
        const filteredToday: MatchEventSummary[] = [];
        rawToday.forEach((ev) => {
          if (!seenToday.has(ev.id)) {
            seenToday.add(ev.id);
            filteredToday.push(ev);
          }
        });

        // Sort today's matches: live first, then upcoming by date, then completed
        filteredToday.sort((a, b) => {
          const aLive = a.status?.type?.state === 'in' ? 1 : 0;
          const bLive = b.status?.type?.state === 'in' ? 1 : 0;
          if (aLive !== bLive) return bLive - aLive;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        setYesterdayMatches(filteredYesterday);
        setTodayMatches(filteredToday);
      } catch (err) {
        console.error('Failed to load ESPN soccer scoreboards:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedLeagueId, yesterdayDateStr, todayDateStr]
  );

  useEffect(() => {
    loadMatches(false);
  }, [loadMatches]);

  // Periodic Auto-refresh (every 30 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadMatches(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadMatches]);

  // Search filter helper
  const filterBySearch = useCallback(
    (matches: MatchEventSummary[]) => {
      if (!searchQuery.trim()) return matches;
      const q = searchQuery.toLowerCase().trim();

      return matches.filter((m) => {
        const comp = m.competitions?.[0];
        const homeName = (
          comp?.competitors?.find((c) => c.homeAway === 'home')?.displayName ||
          comp?.competitors?.find((c) => c.homeAway === 'home')?.team?.displayName ||
          ''
        ).toLowerCase();
        const awayName = (
          comp?.competitors?.find((c) => c.homeAway === 'away')?.displayName ||
          comp?.competitors?.find((c) => c.homeAway === 'away')?.team?.displayName ||
          ''
        ).toLowerCase();
        const leagueName = (m.league || '').toLowerCase();
        const matchName = (m.name || '').toLowerCase();

        return (
          homeName.includes(q) ||
          awayName.includes(q) ||
          leagueName.includes(q) ||
          matchName.includes(q)
        );
      });
    },
    [searchQuery]
  );

  const displayYesterday = useMemo(
    () => filterBySearch(yesterdayMatches),
    [filterBySearch, yesterdayMatches]
  );

  const displayToday = useMemo(
    () => filterBySearch(todayMatches),
    [filterBySearch, todayMatches]
  );

  // Combined matches map for quick lookup
  const allMatchesCombined = useMemo(() => {
    const map = new Map<string, MatchEventSummary>();
    [...todayMatches, ...yesterdayMatches].forEach((m) => {
      map.set(m.id, m);
    });
    return map;
  }, [todayMatches, yesterdayMatches]);

  // Monitored matches list
  const displayMonitored = useMemo(() => {
    const list: MatchEventSummary[] = [];
    monitoredMatchIds.forEach((id) => {
      const m = allMatchesCombined.get(id);
      if (m) list.push(m);
    });
    return filterBySearch(list);
  }, [monitoredMatchIds, allMatchesCombined, filterBySearch]);

  // Live matches count for today
  const liveCount = useMemo(
    () => todayMatches.filter((m) => m.status?.type?.state === 'in').length,
    [todayMatches]
  );

  // Group matches by league
  const groupMatchesByLeague = useCallback((matches: MatchEventSummary[]) => {
    const groups: { [leagueName: string]: MatchEventSummary[] } = {};
    matches.forEach((match) => {
      const leagueName = match.league || 'Other Competitions';
      if (!groups[leagueName]) {
        groups[leagueName] = [];
      }
      groups[leagueName].push(match);
    });

    const leagueOrder = SUPPORTED_LEAGUES.map((l) => l.name);
    const sortedLeagueNames = Object.keys(groups).sort((a, b) => {
      const indexA = leagueOrder.indexOf(a);
      const indexB = leagueOrder.indexOf(b);
      
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedLeagueNames.map((leagueName) => ({
      leagueName,
      matches: groups[leagueName],
    }));
  }, []);

  const groupedYesterday = useMemo(() => groupMatchesByLeague(displayYesterday), [groupMatchesByLeague, displayYesterday]);
  const groupedToday = useMemo(() => groupMatchesByLeague(displayToday), [groupMatchesByLeague, displayToday]);
  const groupedMonitored = useMemo(() => groupMatchesByLeague(displayMonitored), [groupMatchesByLeague, displayMonitored]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-red-900 selection:text-white">
      {/* Header with separated tabs, monitored count, and sync controls */}
      <Header
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t)}
        yesterdayCount={yesterdayMatches.length}
        todayCount={todayMatches.length}
        liveCount={liveCount}
        monitoredCount={monitoredMatchIds.size}
        isRefreshing={isRefreshing}
        onRefresh={() => loadMatches(false)}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* League Selector & Search Bar */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          {/* Quick League Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 md:pb-0 scrollbar-none">
            {SUPPORTED_LEAGUES.map((league) => (
              <button
                key={league.id}
                id={`league-pill-${league.slug}`}
                onClick={() => setSelectedLeagueId(league.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedLeagueId === league.id
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span>{league.name}</span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              id="input-match-search"
              type="text"
              placeholder="Search club, team, or league..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-neutral-500 hover:text-neutral-300 text-xs"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* SECTION: MONITORED MATCHES VIEW */}
        {activeTab === 'monitored' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Monitored Matches
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {displayMonitored.length} actively monitored
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Targeted tracking for goal scorers, assists, disallowed goals, penalties, and red cards
                  </p>
                </div>
              </div>
            </div>

            {groupedMonitored.length > 0 ? (
              <div className="space-y-8">
                {groupedMonitored.map(({ leagueName, matches }) => (
                  <div key={leagueName} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-neutral-900 pb-1.5">
                      <span className="w-1.5 h-3 bg-red-500 rounded-full" />
                      <h3 className="text-xs font-bold text-neutral-400 tracking-wider uppercase">
                        {leagueName}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {matches.map((match) => (
                        <MatchCard
                          key={`monitored-${match.id}`}
                          match={match}
                          leagueDisplayName={match.league}
                          isMonitored={monitoredMatchIds.has(match.id)}
                          onToggleMonitor={toggleMonitorMatch}
                          onSelectMatch={(m) => setActiveMatch(m)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                  <Radio className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-neutral-200">
                  No matches currently added to monitoring
                </h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  Click the <strong>Monitor</strong> button on any match card in Yesterday's Results or Today's Matches to monitor live goal scorers, assists, VAR disallowed decisions, penalties, and red cards.
                </p>
                <button
                  onClick={() => setActiveTab('today')}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Browse Today's Matches
                </button>
              </div>
            )}
          </section>
        )}

        {/* SECTION 1: YESTERDAY'S MATCH RESULTS */}
        {(activeTab === 'separated' || activeTab === 'yesterday') && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300">
                  <CheckCircle2 className="w-4 h-4 text-neutral-300" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Yesterday's Match Results
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                      {displayYesterday.length} results
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Completed football match outcomes for {yesterdayFormattedDisplay}
                  </p>
                </div>
              </div>

              {activeTab === 'separated' && (
                <button
                  onClick={() => setActiveTab('yesterday')}
                  className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
                >
                  <span>Focus Yesterday Only</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 animate-pulse"
                  >
                    <div className="h-4 w-24 bg-neutral-800 rounded" />
                    <div className="space-y-3">
                      <div className="h-6 bg-neutral-800 rounded w-3/4" />
                      <div className="h-6 bg-neutral-800 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : groupedYesterday.length > 0 ? (
              <div className="space-y-8">
                {groupedYesterday.map(({ leagueName, matches }) => (
                  <div key={leagueName} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-neutral-900 pb-1.5">
                      <span className="w-1.5 h-3 bg-red-500 rounded-full" />
                      <h3 className="text-xs font-bold text-neutral-400 tracking-wider uppercase">
                        {leagueName}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {matches.map((match) => (
                        <MatchCard
                          key={`yesterday-${match.id}`}
                          match={match}
                          leagueDisplayName={match.league}
                          isMonitored={monitoredMatchIds.has(match.id)}
                          onToggleMonitor={toggleMonitorMatch}
                          onSelectMatch={(m) => setActiveMatch(m)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-neutral-300">
                  No completed match results found for yesterday in this league
                </p>
                <p className="text-xs text-neutral-500">
                  Select "All Monitored Leagues" or try searching for another club.
                </p>
              </div>
            )}
          </section>
        )}

        {/* SECTION 2: TODAY'S MATCHES (SEPARATED) */}
        {(activeTab === 'separated' || activeTab === 'today') && (
          <section className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-red-950/80 border border-red-800 text-red-400">
                  <Clock className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Today's Football Matches
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-950 text-red-300 border border-red-800">
                      {displayToday.length} matches
                    </span>
                    {liveCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse">
                        {liveCount} LIVE
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Live scores and scheduled fixtures for {todayFormattedDisplay}
                  </p>
                </div>
              </div>

              {activeTab === 'separated' && (
                <button
                  onClick={() => setActiveTab('today')}
                  className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
                >
                  <span>Focus Today Only</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 animate-pulse"
                  >
                    <div className="h-4 w-24 bg-neutral-800 rounded" />
                    <div className="space-y-3">
                      <div className="h-6 bg-neutral-800 rounded w-3/4" />
                      <div className="h-6 bg-neutral-800 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : groupedToday.length > 0 ? (
              <div className="space-y-8">
                {groupedToday.map(({ leagueName, matches }) => (
                  <div key={leagueName} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-neutral-900 pb-1.5">
                      <span className="w-1.5 h-3 bg-red-500 rounded-full" />
                      <h3 className="text-xs font-bold text-neutral-400 tracking-wider uppercase">
                        {leagueName}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {matches.map((match) => (
                        <MatchCard
                          key={`today-${match.id}`}
                          match={match}
                          leagueDisplayName={match.league}
                          isMonitored={monitoredMatchIds.has(match.id)}
                          onToggleMonitor={toggleMonitorMatch}
                          onSelectMatch={(m) => setActiveMatch(m)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-neutral-300">
                  No matches scheduled for today in this league
                </p>
                <p className="text-xs text-neutral-500">
                  Select "All Monitored Leagues" or reset your search query.
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer Info */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-4 text-center text-xs text-neutral-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>ESPN Football Endpoints • Ingestion for Yesterday Results & Today Matches</span>
          <span className="text-neutral-400 font-mono">Real-time Match Monitoring</span>
        </div>
      </footer>

      {/* Match Detail Modal */}
      {activeMatch && (
        <MatchDetailModal
          match={activeMatch}
          onClose={() => setActiveMatch(null)}
          isMonitored={monitoredMatchIds.has(activeMatch.id)}
          onToggleMonitor={toggleMonitorMatch}
        />
      )}
    </div>
  );
}
