import React, { useMemo, useState } from 'react';
import ZTideCanvas from './ZTideCanvas';
import { ZTidePilot } from '../types';

type PerfSample = {
  fps: number;
  frameMs: number;
  entities: number;
  baseHp: number;
  baseHpMax: number;
  gold: number;
  wave: number;
  waveActive: boolean;
  waveRemainingMs: number;
};

type DebugLayer = 'NONE' | 'VECTORS' | 'HEATMAP';
type BrushMode = 'WALL' | 'ERASE';

const ZTideApp: React.FC<{ onExit: () => void; pilot?: ZTidePilot | null }> = ({ onExit, pilot }) => {
  const [perf, setPerf] = useState<PerfSample>({
    fps: 0,
    frameMs: 0,
    entities: 0,
    baseHp: 0,
    baseHpMax: 0,
    gold: 0,
    wave: 0,
    waveActive: false,
    waveRemainingMs: 0,
  });
  const [paused, setPaused] = useState(false);
  const [resolutionScale, setResolutionScale] = useState(1);
  const [debugLayer, setDebugLayer] = useState<DebugLayer>('VECTORS');
  const [brushMode, setBrushMode] = useState<BrushMode>('WALL');
  const [gridSize, setGridSize] = useState(64);
  const [entityCount, setEntityCount] = useState(1500);
  const [densityThreshold, setDensityThreshold] = useState(6);
  const [pressureStrength, setPressureStrength] = useState(1);
  const [waveToken, setWaveToken] = useState(0);

  const hud = useMemo(() => {
    const fps = Number.isFinite(perf.fps) ? Math.round(perf.fps) : 0;
    const frameMs = Number.isFinite(perf.frameMs) ? perf.frameMs.toFixed(2) : '0.00';
    const waveSec = Math.ceil((perf.waveRemainingMs || 0) / 1000);
    return { fps, frameMs, waveSec };
  }, [perf.fps, perf.frameMs, perf.waveRemainingMs]);

  return (
    <div className="absolute inset-0 bg-gray-950">
      <ZTideCanvas
        paused={paused}
        resolutionScale={resolutionScale}
        debugLayer={debugLayer}
        brushMode={brushMode}
        gridSize={gridSize}
        entityCount={entityCount}
        densityThreshold={densityThreshold}
        pressureStrength={pressureStrength}
        waveToken={waveToken}
        pilot={pilot}
        onPerfSample={setPerf}
      />

      <div className="absolute top-4 left-4 z-50 pointer-events-auto space-y-2">
        <div className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 backdrop-blur">
          <div className="text-[10px] font-bold tracking-[0.2em] text-emerald-400 uppercase">
            Z-Tide Prototype
          </div>
          {pilot?.name ? (
            <div className="mt-1 text-[10px] font-mono text-slate-400">
              Seed {pilot.name}
            </div>
          ) : null}
          <div className="mt-1 text-[11px] font-mono text-slate-200">
            FPS {hud.fps} · {hud.frameMs}ms · N {perf.entities}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-200">
            HP {perf.baseHp}/{perf.baseHpMax} · Gold {perf.gold} · Wave {perf.wave}
            {perf.waveActive ? ` · ${hud.waveSec}s` : ''}
          </div>
        </div>

        <div className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 backdrop-blur flex gap-2 items-center">
          <button
            onClick={() => setPaused(p => !p)}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>

          <button
            onClick={() => setWaveToken((v) => v + 1)}
            disabled={perf.waveActive}
            className="px-3 py-1 rounded bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-200 text-xs font-bold disabled:opacity-40 disabled:hover:bg-emerald-900/40"
          >
            {perf.waveActive ? 'Wave Running' : 'Start Wave'}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">Debug</span>
            <select
              value={debugLayer}
              onChange={(e) => setDebugLayer(e.target.value as DebugLayer)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value="VECTORS">Vectors</option>
              <option value="HEATMAP">Heatmap</option>
              <option value="NONE">Off</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">Brush</span>
            <select
              value={brushMode}
              onChange={(e) => setBrushMode(e.target.value as BrushMode)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value="WALL">Wall</option>
              <option value="ERASE">Erase</option>
            </select>
          </div>

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

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">Grid</span>
            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value={48}>48</option>
              <option value={64}>64</option>
              <option value={80}>80</option>
              <option value={96}>96</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">N</span>
            <select
              value={entityCount}
              onChange={(e) => setEntityCount(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value={150}>150</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={1500}>1500</option>
              <option value={2000}>2000</option>
              <option value={3000}>3000</option>
              <option value={4000}>4000</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">ρ</span>
            <select
              value={densityThreshold}
              onChange={(e) => setDensityThreshold(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={8}>8</option>
              <option value={10}>10</option>
              <option value={12}>12</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-300">P</span>
            <select
              value={pressureStrength}
              onChange={(e) => setPressureStrength(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              <option value={0}>0</option>
              <option value={0.5}>0.5</option>
              <option value={1}>1</option>
              <option value={1.5}>1.5</option>
              <option value={2}>2</option>
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
