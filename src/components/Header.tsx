import React from 'react';
import {
  Calendar,
  RefreshCw,
  Activity,
  Radio,
  Clock,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { getWATDates } from '../services/espn';

export type ViewTab = 'separated' | 'yesterday' | 'today' | 'monitored';

interface HeaderProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  yesterdayCount: number;
  todayCount: number;
  liveCount: number;
  monitoredCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  yesterdayCount,
  todayCount,
  liveCount,
  monitoredCount,
  isRefreshing,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
}) => {
  const { todayFormattedDisplay, yesterdayFormattedDisplay } = getWATDates();

  return (
    <header className="border-b border-neutral-800 bg-neutral-950 text-neutral-100 sticky top-0 z-30 shadow-md">
      {/* Top row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center font-black tracking-tight text-white text-base shadow-sm">
            ⚽
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Football Match & Event Tracker
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-300 border border-red-800">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse"></span>
                ESPN Live Data
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Yesterday's Results & Today's Matches • Events, Live Triggers, Box Scores & Lineups
            </p>
          </div>
        </div>

        {/* View Switcher Tabs (Separated, Yesterday Only, Today Only) */}
        <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl p-1 shadow-inner">
          <button
            id="tab-separated"
            onClick={() => onTabChange('separated')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'separated'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Separated (Both)</span>
          </button>

          <button
            id="tab-yesterday"
            onClick={() => onTabChange('yesterday')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'yesterday'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-neutral-300" />
            <span>Yesterday's Results</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'yesterday'
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              {yesterdayCount}
            </span>
          </button>

          <button
            id="tab-today"
            onClick={() => onTabChange('today')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'today'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-neutral-300" />
            <span>Today's Matches</span>
            {liveCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'today'
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              {todayCount}
            </span>
          </button>

          <button
            id="tab-monitored"
            onClick={() => onTabChange('monitored')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'monitored'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${monitoredCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-neutral-400'}`} />
            <span>Monitored</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'monitored'
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              {monitoredCount}
            </span>
          </button>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2">
          <button
            id="btn-auto-refresh"
            onClick={onToggleAutoRefresh}
            title={autoRefresh ? 'Disable 30s auto-refresh' : 'Enable 30s auto-refresh'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              autoRefresh
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Radio
              className={`w-3.5 h-3.5 ${
                autoRefresh ? 'text-emerald-400 animate-pulse' : ''
              }`}
            />
            <span className="hidden sm:inline">Auto-Sync</span>
          </button>

          <button
            id="btn-refresh"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-400' : ''}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Sub-header status bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-800/80 bg-neutral-900/40">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-neutral-500"></span>
            Yesterday: <strong className="text-neutral-200">{yesterdayFormattedDisplay}</strong> ({yesterdayCount} results)
          </span>
          <span className="text-neutral-600">•</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Today: <strong className="text-neutral-200">{todayFormattedDisplay}</strong> ({todayCount} fixtures{liveCount > 0 ? `, ${liveCount} live` : ''})
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span>Timezone: Africa/Lagos (WAT)</span>
        </div>
      </div>
    </header>
  );
};
