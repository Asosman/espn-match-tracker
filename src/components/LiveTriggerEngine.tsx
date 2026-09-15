import React, { useState, useEffect } from 'react';
import {
  Activity,
  Bell,
  Play,
  Pause,
  RotateCcw,
  Zap,
  ShieldAlert,
  Clock,
  Radio,
  Sliders,
  CheckCircle2,
  Volume2,
  VolumeX,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { ComprehensiveMatchData, CoreLiveTriggerItem } from '../types';

interface LiveTriggerEngineProps {
  matchData: ComprehensiveMatchData;
}

export const LiveTriggerEngine: React.FC<LiveTriggerEngineProps> = ({ matchData }) => {
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'scoring' | 'disallowed' | 'penalties' | 'redcards' | 'halftime_fulltime' | 'discipline' | 'subs'
  >('all');
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulatedIndex, setSimulatedIndex] = useState(0);
  const [simSpeedMs, setSimSpeedMs] = useState(1500);

  // Core trigger events list
  const corePlays = matchData.corePlays || [];

  // Construct comprehensive trigger list
  const triggersList: CoreLiveTriggerItem[] =
    corePlays.length > 0
      ? corePlays
      : (matchData.keyEvents || matchData.commentary || []).map((k, i) => {
          const text = k.text || '';
          const lowerText = text.toLowerCase();
          const typeText = (k.type?.text || '').toLowerCase();

          const isDisallowed =
            typeText.includes('disallowed') ||
            lowerText.includes('disallowed') ||
            lowerText.includes('overturned');
          const isGoal =
            !isDisallowed &&
            (Boolean(k.scoringPlay) ||
              typeText.includes('goal') ||
              lowerText.includes('goal!'));
          const isPenalty =
            Boolean(k.penaltyKick) ||
            typeText.includes('penalty') ||
            lowerText.includes('penalty');
          const isRedCard =
            Boolean(k.redCard) ||
            typeText.includes('red card') ||
            lowerText.includes('red card') ||
            lowerText.includes('sent off');
          const isYellowCard =
            Boolean(k.yellowCard) ||
            typeText.includes('yellow card') ||
            lowerText.includes('yellow card');
          const isSub =
            Boolean(k.substitution) ||
            typeText.includes('substitution') ||
            lowerText.includes('substitution') ||
            lowerText.includes('replaces');

          return {
            id: k.id || String(i),
            type: {
              id: String(i),
              text: isDisallowed ? 'Goal Disallowed' : k.type?.text || (isGoal ? 'Goal' : 'Event'),
              type: typeText || 'event',
            },
            wallclock: k.wallclock || new Date().toISOString(),
            modified: new Date().toISOString(),
            period: { number: k.period?.number || 1 },
            clock: { displayValue: k.time?.displayValue || 'FT', value: 0 },
            scoringPlay: isGoal,
            scoreValue: isGoal ? 1 : 0,
            priority: Boolean(k.priority || isGoal || isRedCard || isDisallowed),
            substitution: isSub,
            yellowCard: isYellowCard,
            redCard: isRedCard,
            penaltyKick: isPenalty,
            ownGoal: Boolean(k.ownGoal || lowerText.includes('own goal')),
            hasVideoTagging: true,
            homeScore: k.homeScore || 0,
            awayScore: k.awayScore || 0,
            source: { id: '38', description: 'SA.ENVOY' },
            text: k.text,
          };
        });

  // Filtering
  const filteredTriggers = triggersList.filter((item) => {
    const text = (item.text || '').toLowerCase();
    const typeText = (item.type?.text || '').toLowerCase();

    if (activeFilter === 'scoring') return item.scoringPlay || item.scoreValue > 0;
    if (activeFilter === 'disallowed') {
      return (
        typeText.includes('disallowed') ||
        text.includes('disallowed') ||
        text.includes('overturned')
      );
    }
    if (activeFilter === 'penalties') {
      return item.penaltyKick || text.includes('penalty');
    }
    if (activeFilter === 'redcards') {
      return item.redCard || text.includes('red card') || text.includes('sent off');
    }
    if (activeFilter === 'halftime_fulltime') {
      return (
        text.includes('half') ||
        text.includes('full time') ||
        text.includes('halftime') ||
        typeText.includes('halftime') ||
        typeText.includes('fulltime') ||
        typeText.includes('period')
      );
    }
    if (activeFilter === 'discipline') return item.yellowCard || item.redCard;
    if (activeFilter === 'subs') return item.substitution;
    return true;
  });

  // Simulation loop
  useEffect(() => {
    let timer: any;
    if (simulationActive && filteredTriggers.length > 0) {
      timer = setInterval(() => {
        setSimulatedIndex((prev) => {
          const next = prev + 1;
          if (next >= filteredTriggers.length) {
            setSimulationActive(false);
            return 0;
          }
          return next;
        });
      }, simSpeedMs);
    }
    return () => clearInterval(timer);
  }, [simulationActive, filteredTriggers.length, simSpeedMs]);

  // Active simulated event
  const currentSimulatedEvent =
    filteredTriggers[simulatedIndex] || filteredTriggers[0];

  // Trigger metrics counts
  const scoringTriggersCount = triggersList.filter((t) => t.scoringPlay).length;
  const disallowedTriggersCount = triggersList.filter(
    (t) =>
      (t.type?.text || '').toLowerCase().includes('disallowed') ||
      (t.text || '').toLowerCase().includes('disallowed') ||
      (t.text || '').toLowerCase().includes('overturned')
  ).length;
  const penaltyTriggersCount = triggersList.filter(
    (t) => t.penaltyKick || (t.text || '').toLowerCase().includes('penalty')
  ).length;
  const redCardTriggersCount = triggersList.filter(
    (t) => t.redCard || (t.text || '').toLowerCase().includes('red card')
  ).length;
  const subTriggersCount = triggersList.filter((t) => t.substitution).length;

  return (
    <div className="space-y-6">
      {/* Engine Status Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-base font-bold text-white">
                ESPN Live Event Ingestion & Trigger Engine
              </h3>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Active telemetry tracking goal scorers, assists, VAR disallowed decisions, penalties, and red cards
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Source: SA.ENVOY Telemetry</span>
            </span>
          </div>
        </div>

        {/* Live Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Goal Scorers</span>
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{scoringTriggersCount}</div>
            <span className="text-[10px] text-emerald-400 font-medium">Scoring events</span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Disallowed Goals</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{disallowedTriggersCount}</div>
            <span className="text-[10px] text-rose-400 font-medium">VAR overturned</span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Penalties</span>
              <Bell className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{penaltyTriggersCount}</div>
            <span className="text-[10px] text-amber-400 font-medium">Spot kicks</span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Red Cards</span>
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{redCardTriggersCount}</div>
            <span className="text-[10px] text-red-400 font-medium">Sent off players</span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Total Events</span>
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{triggersList.length}</div>
            <span className="text-[10px] text-indigo-400 font-medium">Pipeline items</span>
          </div>
        </div>
      </div>

      {/* Live Simulation Replay Controller */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-red-500" />
              <span>Live Trigger Simulation & Event Replay</span>
            </h4>
            <p className="text-xs text-neutral-400 mt-0.5">
              Step through or replay tracked event triggers chronologically as processed by the live update pipeline
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSimulationActive(!simulationActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                simulationActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              }`}
            >
              {simulationActive ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Replay</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Live Replay</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setSimulationActive(false);
                setSimulatedIndex(0);
              }}
              title="Reset Replay"
              className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg border border-neutral-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Active Broadcast Preview Box */}
        {currentSimulatedEvent && (
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-200">
                  {currentSimulatedEvent.clock?.displayValue || 'FT'}
                </span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  {currentSimulatedEvent.type?.text}
                </span>
                {currentSimulatedEvent.scoringPlay && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                    GOAL
                  </span>
                )}
                {currentSimulatedEvent.redCard && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                    RED CARD
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-neutral-100">
                {currentSimulatedEvent.text || currentSimulatedEvent.type?.text}
              </p>
            </div>

            <div className="text-right sm:shrink-0 font-mono">
              <span className="text-xs text-neutral-400 block">Current Scoreline</span>
              <span className="text-lg font-black text-white">
                {currentSimulatedEvent.awayScore} - {currentSimulatedEvent.homeScore}
              </span>
            </div>
          </div>
        )}

        {/* Filter Buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
          <span className="text-xs font-semibold text-neutral-400">Filter Event Feed:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              All ({triggersList.length})
            </button>
            <button
              onClick={() => setActiveFilter('scoring')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'scoring'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Goals & Assists ({scoringTriggersCount})
            </button>
            <button
              onClick={() => setActiveFilter('disallowed')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'disallowed'
                  ? 'bg-rose-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Disallowed ({disallowedTriggersCount})
            </button>
            <button
              onClick={() => setActiveFilter('penalties')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'penalties'
                  ? 'bg-amber-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Penalties ({penaltyTriggersCount})
            </button>
            <button
              onClick={() => setActiveFilter('redcards')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'redcards'
                  ? 'bg-red-700 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Red Cards ({redCardTriggersCount})
            </button>
            <button
              onClick={() => setActiveFilter('halftime_fulltime')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'halftime_fulltime'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              HT / FT
            </button>
            <button
              onClick={() => setActiveFilter('subs')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeFilter === 'subs'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Subs ({subTriggersCount})
            </button>
          </div>
        </div>

        {/* Scrollable Triggers Table */}
        <div className="overflow-x-auto border border-neutral-800 rounded-lg max-h-96">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 w-16">Time</th>
                <th className="py-2.5 px-3">Trigger Event Type</th>
                <th className="py-2.5 px-3">Event Description</th>
                <th className="py-2.5 px-3 text-center">Flags</th>
                <th className="py-2.5 px-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {filteredTriggers.map((trig, idx) => (
                <tr
                  key={trig.id || idx}
                  className={`hover:bg-neutral-850/60 transition-colors ${
                    trig.scoringPlay ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-semibold text-neutral-200">
                    {trig.clock?.displayValue || 'FT'}
                  </td>
                  <td className="py-2.5 px-3 text-white font-medium font-sans">
                    {trig.type?.text}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-300 font-sans max-w-xs truncate">
                    {trig.text || trig.type?.text}
                  </td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <div className="flex items-center justify-center gap-1">
                      {trig.scoringPlay && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" title="Scoring Play" />
                      )}
                      {trig.priority && (
                        <span className="w-2 h-2 rounded-full bg-amber-400" title="Priority Notification" />
                      )}
                      {trig.yellowCard && (
                        <span className="w-2 h-2 rounded-full bg-yellow-400" title="Yellow Card" />
                      )}
                      {trig.redCard && (
                        <span className="w-2 h-2 rounded-full bg-red-500" title="Red Card" />
                      )}
                      {trig.substitution && (
                        <span className="w-2 h-2 rounded-full bg-cyan-400" title="Substitution" />
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-neutral-300 font-bold">
                    {trig.awayScore} - {trig.homeScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
