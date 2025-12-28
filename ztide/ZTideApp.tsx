import React, { useMemo, useState } from 'react';
import ZTideCanvas from './ZTideCanvas';

type PerfSample = {
  fps: number;
  frameMs: number;
  entities: number;
};

const ZTideApp: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [perf, setPerf] = useState<PerfSample>({ fps: 0, frameMs: 0, entities: 0 });
  const [paused, setPaused] = useState(false);
  const [resolutionScale, setResolutionScale] = useState(1);

  const hud = useMemo(() => {
    const fps = Number.isFinite(perf.fps) ? Math.round(perf.fps) : 0;
    const frameMs = Number.isFinite(perf.frameMs) ? perf.frameMs.toFixed(2) : '0.00';
    return { fps, frameMs };
  }, [perf.fps, perf.frameMs]);

  return (
    <div className="absolute inset-0 bg-gray-950">
      <ZTideCanvas
        paused={paused}
        resolutionScale={resolutionScale}
        onPerfSample={setPerf}
      />

      <div className="absolute top-4 left-4 z-50 pointer-events-auto space-y-2">
        <div className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 backdrop-blur">
          <div className="text-[10px] font-bold tracking-[0.2em] text-emerald-400 uppercase">
            Z-Tide Prototype
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-200">
            FPS {hud.fps} · {hud.frameMs}ms · N {perf.entities}
          </div>
        </div>

        <div className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 backdrop-blur flex gap-2 items-center">
          <button
            onClick={() => setPaused(p => !p)}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">Res</span>
            <select
              value={resolutionScale}
              onChange={(e) => setResolutionScale(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value={0.75}>0.75</option>
              <option value={1}>1.0</option>
              <option value={1.25}>1.25</option>
              <option value={1.5}>1.5</option>
              <option value={2}>2.0</option>
            </select>
          </div>

          <button
            onClick={onExit}
            className="ml-auto px-3 py-1 rounded bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 text-xs font-bold"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZTideApp;

