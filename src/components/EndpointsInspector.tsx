import React, { useState } from 'react';
import { Terminal, ExternalLink, Copy, Check, Server, ShieldCheck } from 'lucide-react';
import { ComprehensiveMatchData } from '../types';
import { SITE_BASE, SITE_V3_BASE, CORE_BASE, CDN_BASE } from '../services/espn';

interface EndpointsInspectorProps {
  matchData: ComprehensiveMatchData;
}

export const EndpointsInspector: React.FC<EndpointsInspectorProps> = ({ matchData }) => {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [activeJsonTab, setActiveJsonTab] = useState<'summary' | 'boxscore' | 'rosters' | 'core'>('summary');

  const meta = matchData.endpointsMeta;

  const endpointsList = [
    {
      name: 'SITE_BASE (v2 Summary & Boxscore)',
      url: meta.siteSummaryUrl,
      base: SITE_BASE,
      desc: 'Retrieves primary match summary, team boxscores, player rosters, linescores, and game story.',
      status: '200 OK',
    },
    {
      name: 'CORE_BASE (v2 Live Telemetry Plays)',
      url: meta.corePlaysUrl,
      base: CORE_BASE,
      desc: 'Retrieves granular play events, priority alerts, scoring flags, and SA.ENVOY telemetry triggers.',
      status: '200 OK',
    },
    {
      name: 'CDN_BASE (Core Gamepackage XHR)',
      url: meta.cdnMatchUrl,
      base: CDN_BASE,
      desc: 'Retrieves CDN cached gamepackage, navigational tags, and editorial assets.',
      status: '200 OK',
    },
    {
      name: 'SITE_V3_BASE (Site v3 Reference)',
      url: meta.siteV3Url,
      base: SITE_V3_BASE,
      desc: 'Configured for high-tier sport metadata and roster registries.',
      status: 'Configured',
    },
  ];

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const getActiveJson = () => {
    switch (activeJsonTab) {
      case 'summary':
        return matchData.header || matchData.event;
      case 'boxscore':
        return matchData.boxscore;
      case 'rosters':
        return matchData.rosters;
      case 'core':
        return matchData.corePlays?.slice(0, 5) || [];
      default:
        return matchData.event;
    }
  };

  return (
    <div className="space-y-6">
      {/* Endpoints Table Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-base font-bold text-white">Configured ESPN REST Endpoints</h3>
              <p className="text-xs text-neutral-400">
                Direct integration with ESPN API endpoints for match tracking and live trigger ingestion
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-neutral-400">Latency:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
              {meta.latencyMs} ms
            </span>
          </div>
        </div>

        {/* List of 4 endpoints */}
        <div className="space-y-3">
          {endpointsList.map((ep, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-neutral-850 text-neutral-300 font-mono text-[11px] font-bold border border-neutral-700">
                    {ep.name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-800">
                    {ep.status}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopy(ep.url)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs transition-colors border border-neutral-750"
                  >
                    {copiedUrl === ep.url ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 text-[11px]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-neutral-400" />
                        <span className="text-[11px]">Copy URL</span>
                      </>
                    )}
                  </button>

                  <a
                    href={ep.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-750"
                    title="Open in new window"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                  </a>
                </div>
              </div>

              <div className="font-mono text-xs text-neutral-400 break-all bg-neutral-900/60 p-2 rounded border border-neutral-850">
                {ep.url}
              </div>

              <p className="text-xs text-neutral-400">{ep.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Raw JSON Data Viewer */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-white">Live Endpoint Response Payload</h4>
          </div>

          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => setActiveJsonTab('summary')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeJsonTab === 'summary'
                  ? 'bg-red-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Header/Summary
            </button>
            <button
              onClick={() => setActiveJsonTab('boxscore')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeJsonTab === 'boxscore'
                  ? 'bg-red-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Boxscore
            </button>
            <button
              onClick={() => setActiveJsonTab('rosters')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeJsonTab === 'rosters'
                  ? 'bg-red-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Rosters
            </button>
            <button
              onClick={() => setActiveJsonTab('core')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeJsonTab === 'core'
                  ? 'bg-red-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Core Plays
            </button>
          </div>
        </div>

        <pre className="p-4 bg-neutral-950 rounded-lg border border-neutral-800 text-neutral-300 font-mono text-[11px] overflow-x-auto max-h-72 overflow-y-auto leading-relaxed">
          {JSON.stringify(getActiveJson(), null, 2)}
        </pre>
      </div>
    </div>
  );
};
