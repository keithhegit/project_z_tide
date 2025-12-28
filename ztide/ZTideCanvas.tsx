import React, { useEffect, useMemo, useRef } from 'react';
import { Application, Container, Graphics, Particle, ParticleContainer, Texture } from 'pixi.js';
import { DIR_TO_VEC, FLOW_DIR_NONE, FlowField } from './core/FlowField';
import { mapDataService } from '../services/mapDataService';
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

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ZTideCanvas: React.FC<{
  paused: boolean;
  resolutionScale: number;
  debugLayer: 'NONE' | 'VECTORS' | 'HEATMAP';
  brushMode: 'WALL' | 'ERASE';
  gridSize: number;
  entityCount: number;
  densityThreshold: number;
  pressureStrength: number;
  waveToken: number;
  pilot?: ZTidePilot | null;
  onPerfSample: (sample: PerfSample) => void;
}> = ({ paused, resolutionScale, debugLayer, brushMode, gridSize, entityCount, densityThreshold, pressureStrength, waveToken, pilot, onPerfSample }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const appReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const lastPerfAtRef = useRef<number>(0);
  const lastFrameAtRef = useRef<number>(performance.now());
  const entitiesRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(paused);
  const debugLayerRef = useRef<'NONE' | 'VECTORS' | 'HEATMAP'>(debugLayer);
  const brushModeRef = useRef<'WALL' | 'ERASE'>(brushMode);
  const densityThresholdRef = useRef<number>(densityThreshold);
  const pressureStrengthRef = useRef<number>(pressureStrength);
  const pilotRef = useRef<ZTidePilot | null | undefined>(pilot);
  const setGridSizeRef = useRef<null | ((n: number) => void)>(null);
  const setEntityCountRef = useRef<null | ((n: number) => void)>(null);
  const startWaveRef = useRef<null | (() => void)>(null);
  const rerenderDebugRef = useRef<null | (() => void)>(null);
  const applyPilotRef = useRef<null | ((p: ZTidePilot | null | undefined) => void)>(null);

  const effectiveResolution = useMemo(() => {
    const dpr = window.devicePixelRatio || 1;
    return clamp(dpr * resolutionScale, 1, 2);
  }, [resolutionScale]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    appRef.current = app;
    appReadyRef.current = false;

    let destroyed = false;
    let teardown: null | (() => void) = null;

    const init = async () => {
      await app.init({
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: effectiveResolution,
        resizeTo: host,
        powerPreference: 'high-performance',
      });

      if (destroyed) return;

      appReadyRef.current = true;
      host.appendChild(app.canvas);

      const root = new Container();
      app.stage.addChild(root);

      const fieldLayer = new Container();
      const heatLayer = new Graphics();
      const wallLayer = new Graphics();
      const vectorLayer = new Graphics();
      const overlayLayer = new Graphics();
      fieldLayer.addChild(heatLayer);
      fieldLayer.addChild(wallLayer);
      fieldLayer.addChild(vectorLayer);
      fieldLayer.addChild(overlayLayer);
      root.addChild(fieldLayer);

      const swarmLayer = new Container();
      root.addChild(swarmLayer);

      let field = new FlowField({ width: gridSize, height: gridSize });
      let baseCost: Uint8Array | null = null;
      let pilotRequestId = 0;

      let cellPx = 10;
      let offsetX = 0;
      let offsetY = 0;

      let baseHpMax = 100;
      let baseHp = baseHpMax;
      let gold = 0;
      let wave = 0;
      let waveActive = false;
      let waveEndsAt = 0;
      let waveDurationMs = 35_000;
      let fireCooldown = 0;

      const particleTexture = (() => {
        const canvas = document.createElement('canvas');
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return Texture.WHITE;
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
        ctx.fill();
        return Texture.from(canvas);
      })();

      const computeLayout = () => {
        const w = app.renderer.width;
        const h = app.renderer.height;
        cellPx = Math.floor(Math.min(w / field.width, h / field.height));
        cellPx = Math.max(6, cellPx);
        const gridW = field.width * cellPx;
        const gridH = field.height * cellPx;
        offsetX = Math.floor((w - gridW) / 2);
        offsetY = Math.floor((h - gridH) / 2);
      };

      const renderWalls = () => {
        wallLayer.clear();
        wallLayer.setFillStyle({ color: 0x334155, alpha: 0.95 });
        for (let y = 0; y < field.height; y++) {
          for (let x = 0; x < field.width; x++) {
            if (!field.isWall(x, y)) continue;
            wallLayer.rect(offsetX + x * cellPx, offsetY + y * cellPx, cellPx, cellPx);
          }
        }
        wallLayer.fill();
      };

      const renderHeat = () => {
        heatLayer.clear();
        if (debugLayerRef.current !== 'HEATMAP') return;

        const targetIdx = field.idx(field.targetX, field.targetY);
        let max = 1;
        for (let i = 0; i < field.integration.length; i++) {
          const v = field.integration[i];
          if (v !== 0xffff && v > max) max = v;
        }

        for (let y = 0; y < field.height; y++) {
          for (let x = 0; x < field.width; x++) {
            const i = field.idx(x, y);
            if (field.cost[i] === 255) continue;
            const v = field.integration[i];
            if (v === 0xffff) continue;
            const t = i === targetIdx ? 0 : v / max;
            const r = Math.floor(20 + 80 * (1 - t));
            const g = Math.floor(30 + 60 * (1 - t));
            const b = Math.floor(60 + 120 * t);
            const color = (r << 16) | (g << 8) | b;
            heatLayer.setFillStyle({ color, alpha: 0.6 });
            heatLayer.rect(offsetX + x * cellPx, offsetY + y * cellPx, cellPx, cellPx);
            heatLayer.fill();
          }
        }
      };

      const renderVectors = () => {
        vectorLayer.clear();
        if (debugLayerRef.current !== 'VECTORS') return;

        vectorLayer.setStrokeStyle({ width: Math.max(1, Math.floor(cellPx / 10)), color: 0x93c5fd, alpha: 0.75 });
        const len = Math.max(4, Math.floor(cellPx * 0.35));

        for (let y = 0; y < field.height; y++) {
          for (let x = 0; x < field.width; x++) {
            const i = field.idx(x, y);
            if (field.cost[i] === 255) continue;
            const dir = field.direction[i];
            if (dir === FLOW_DIR_NONE) continue;
            const v = DIR_TO_VEC[dir];
            const cx = offsetX + x * cellPx + cellPx * 0.5;
            const cy = offsetY + y * cellPx + cellPx * 0.5;
            const ex = cx + v.x * len;
            const ey = cy + v.y * len;
            vectorLayer.moveTo(cx, cy);
            vectorLayer.lineTo(ex, ey);
          }
        }
        vectorLayer.stroke();
      };

      const renderOverlay = () => {
        overlayLayer.clear();
        overlayLayer.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.08 });
        const w = field.width * cellPx;
        const h = field.height * cellPx;
        for (let x = 0; x <= field.width; x++) {
          const px = offsetX + x * cellPx;
          overlayLayer.moveTo(px, offsetY);
          overlayLayer.lineTo(px, offsetY + h);
        }
        for (let y = 0; y <= field.height; y++) {
          const py = offsetY + y * cellPx;
          overlayLayer.moveTo(offsetX, py);
          overlayLayer.lineTo(offsetX + w, py);
        }
        overlayLayer.stroke();

        overlayLayer.setFillStyle({ color: 0x22c55e, alpha: 0.9 });
        overlayLayer.circle(offsetX + (field.targetX + 0.5) * cellPx, offsetY + (field.targetY + 0.5) * cellPx, Math.max(3, cellPx * 0.22));
        overlayLayer.fill();
      };

      const rebuildField = () => {
        computeLayout();
        const tx = Math.floor(field.width / 2);
        const ty = Math.floor(field.height / 2);
        field.generate(tx, ty);
        renderHeat();
        renderWalls();
        renderVectors();
        renderOverlay();
      };

      const rebuildSwarm = () => {
        swarmLayer.removeChildren();
        const count = Math.max(0, Math.floor(entitiesRef.current || entityCount));
        entitiesRef.current = count;

        const container = new ParticleContainer({
          texture: particleTexture,
          dynamicProperties: { position: true },
        });
        swarmLayer.addChild(container);

        const posX = new Float32Array(count);
        const posY = new Float32Array(count);
        const velX = new Float32Array(count);
        const velY = new Float32Array(count);
        const particles: Particle[] = new Array(count);
        const hp = new Uint16Array(count);
        const cellCount = new Uint16Array(field.width * field.height);

        const spawnEdge = (i: number) => {
          const side = (Math.random() * 4) | 0;
          let gx = 0;
          let gy = 0;
          if (side === 0) {
            gx = 0;
            gy = (Math.random() * field.height) | 0;
          } else if (side === 1) {
            gx = field.width - 1;
            gy = (Math.random() * field.height) | 0;
          } else if (side === 2) {
            gx = (Math.random() * field.width) | 0;
            gy = 0;
          } else {
            gx = (Math.random() * field.width) | 0;
            gy = field.height - 1;
          }
          const x = offsetX + (gx + 0.5) * cellPx;
          const y = offsetY + (gy + 0.5) * cellPx;
          posX[i] = x;
          posY[i] = y;
          velX[i] = 0;
          velY[i] = 0;
          const enemyBaseHp = 34 + wave * 10;
          hp[i] = enemyBaseHp & 0xffff;
        };

        const radius = Math.max(2, cellPx * 0.18);
        const texSize = 32;
        const scale = (radius * 2) / texSize;

        for (let i = 0; i < count; i++) {
          spawnEdge(i);
          const p = new Particle({
            texture: particleTexture,
            x: posX[i],
            y: posY[i],
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: scale,
            scaleY: scale,
          });
          particles[i] = p;
          container.addParticle(p);
        }

        const speed = 52;
        const damping = 0.86;
        const maxSpeed = 180;

        const bucketSize = Math.max(radius * 3, cellPx * 0.6);
        const bucketsX = Math.max(1, Math.ceil((field.width * cellPx) / bucketSize));
        const bucketsY = Math.max(1, Math.ceil((field.height * cellPx) / bucketSize));
        const bucketHead = new Int32Array(bucketsX * bucketsY);
        const next = new Int32Array(count);
        bucketHead.fill(-1);

        const desired = radius * 1.85;
        const desired2 = desired * desired;

        const updateSwarm = (dt: number) => {
          if (!waveActive) return;

          const w = app.renderer.width;
          const h = app.renderer.height;

          bucketHead.fill(-1);
          cellCount.fill(0);

          const baseX = offsetX + (field.targetX + 0.5) * cellPx;
          const baseY = offsetY + (field.targetY + 0.5) * cellPx;
          const baseRadius = Math.max(6, cellPx * 0.55);
          const baseRadius2 = baseRadius * baseRadius;

          for (let i = 0; i < count; i++) {
            const x = posX[i];
            const y = posY[i];
            const rx = x - offsetX;
            const ry = y - offsetY;
            const bx = clamp(Math.floor(rx / bucketSize), 0, bucketsX - 1);
            const by = clamp(Math.floor(ry / bucketSize), 0, bucketsY - 1);
            const b = by * bucketsX + bx;
            next[i] = bucketHead[b];
            bucketHead[b] = i;

            const gx = Math.floor(rx / cellPx);
            const gy = Math.floor(ry / cellPx);
            if (field.inBounds(gx, gy) && !field.isWall(gx, gy)) {
              const idx = field.idx(gx, gy);
              const v = cellCount[idx];
              if (v !== 0xffff) cellCount[idx] = (v + 1) & 0xffff;
            }
          }

          fireCooldown -= dt;
          if (fireCooldown <= 0) {
            fireCooldown = 0.11;
            const range = Math.max(cellPx * 7.5, 60);
            const range2 = range * range;
            const bx = clamp(Math.floor((baseX - offsetX) / bucketSize), 0, bucketsX - 1);
            const by = clamp(Math.floor((baseY - offsetY) / bucketSize), 0, bucketsY - 1);
            const r = Math.max(1, Math.ceil(range / bucketSize));

            let bestI = -1;
            let bestD2 = range2;

            for (let oy = -r; oy <= r; oy++) {
              const yb = by + oy;
              if (yb < 0 || yb >= bucketsY) continue;
              for (let ox = -r; ox <= r; ox++) {
                const xb = bx + ox;
                if (xb < 0 || xb >= bucketsX) continue;
                let j = bucketHead[yb * bucketsX + xb];
                while (j !== -1) {
                  const dx = posX[j] - baseX;
                  const dy = posY[j] - baseY;
                  const d2 = dx * dx + dy * dy;
                  if (d2 < bestD2) {
                    bestD2 = d2;
                    bestI = j;
                  }
                  j = next[j];
                }
              }
            }

            if (bestI !== -1) {
              const dmg = 14 + wave * 2;
              const cur = hp[bestI];
              if (cur <= dmg) {
                gold += 1;
                spawnEdge(bestI);
                particles[bestI].x = posX[bestI];
                particles[bestI].y = posY[bestI];
              } else {
                hp[bestI] = (cur - dmg) & 0xffff;
              }
            }
          }

          for (let i = 0; i < count; i++) {
            const x = posX[i];
            const y = posY[i];
            const gx = Math.floor((x - offsetX) / cellPx);
            const gy = Math.floor((y - offsetY) / cellPx);

            let ax = 0;
            let ay = 0;

            if (field.inBounds(gx, gy)) {
              const idx = field.idx(gx, gy);
              const dir = field.direction[idx];
              if (dir !== FLOW_DIR_NONE) {
                const v = DIR_TO_VEC[dir];
                ax += v.x * speed;
                ay += v.y * speed;
              }
            }

            if (field.inBounds(gx, gy) && !field.isWall(gx, gy)) {
              const threshold = Math.max(1, densityThresholdRef.current | 0);
              const idx = field.idx(gx, gy);
              const here = cellCount[idx];
              if (here > threshold) {
                let bestCount = here;
                let bestDx = 0;
                let bestDy = 0;

                const nx0 = gx + 1;
                const nx1 = gx - 1;
                const ny0 = gy + 1;
                const ny1 = gy - 1;

                if (field.inBounds(nx0, gy) && !field.isWall(nx0, gy)) {
                  const c = cellCount[field.idx(nx0, gy)];
                  if (c < bestCount) {
                    bestCount = c;
                    bestDx = 1;
                    bestDy = 0;
                  }
                }
                if (field.inBounds(nx1, gy) && !field.isWall(nx1, gy)) {
                  const c = cellCount[field.idx(nx1, gy)];
                  if (c < bestCount) {
                    bestCount = c;
                    bestDx = -1;
                    bestDy = 0;
                  }
                }
                if (field.inBounds(gx, ny0) && !field.isWall(gx, ny0)) {
                  const c = cellCount[field.idx(gx, ny0)];
                  if (c < bestCount) {
                    bestCount = c;
                    bestDx = 0;
                    bestDy = 1;
                  }
                }
                if (field.inBounds(gx, ny1) && !field.isWall(gx, ny1)) {
                  const c = cellCount[field.idx(gx, ny1)];
                  if (c < bestCount) {
                    bestCount = c;
                    bestDx = 0;
                    bestDy = -1;
                  }
                }

                if (bestDx !== 0 || bestDy !== 0) {
                  const delta = here - bestCount;
                  const push = Math.min(12, delta) * pressureStrengthRef.current * 12;
                  ax += bestDx * push;
                  ay += bestDy * push;
                }
              }
            }

            const rx = x - offsetX;
            const ry = y - offsetY;
            const cbx = clamp(Math.floor(rx / bucketSize), 0, bucketsX - 1);
            const cby = clamp(Math.floor(ry / bucketSize), 0, bucketsY - 1);

            let sepX = 0;
            let sepY = 0;
            for (let oy = -1; oy <= 1; oy++) {
              const by = cby + oy;
              if (by < 0 || by >= bucketsY) continue;
              for (let ox = -1; ox <= 1; ox++) {
                const bx = cbx + ox;
                if (bx < 0 || bx >= bucketsX) continue;
                let j = bucketHead[by * bucketsX + bx];
                while (j !== -1) {
                  if (j !== i) {
                    const dx = x - posX[j];
                    const dy = y - posY[j];
                    const d2 = dx * dx + dy * dy;
                    if (d2 > 0.0001 && d2 < desired2) {
                      const inv = 1 / Math.sqrt(d2);
                      const push = (desired - Math.sqrt(d2)) * 28;
                      sepX += dx * inv * push;
                      sepY += dy * inv * push;
                    }
                  }
                  j = next[j];
                }
              }
            }

            ax += sepX;
            ay += sepY;

            let vx = velX[i] * damping + ax * dt;
            let vy = velY[i] * damping + ay * dt;

            const sp2 = vx * vx + vy * vy;
            if (sp2 > maxSpeed * maxSpeed) {
              const inv = maxSpeed / Math.sqrt(sp2);
              vx *= inv;
              vy *= inv;
            }

            let nx = x + vx;
            let ny = y + vy;

            if (nx < 0 || nx > w || ny < 0 || ny > h) {
              spawnEdge(i);
              particles[i].x = posX[i];
              particles[i].y = posY[i];
              continue;
            }

            const bdx = nx - baseX;
            const bdy = ny - baseY;
            if (bdx * bdx + bdy * bdy < baseRadius2) {
              baseHp = Math.max(0, baseHp - 1);
              spawnEdge(i);
              particles[i].x = posX[i];
              particles[i].y = posY[i];
              continue;
            }

            const ngx = Math.floor((nx - offsetX) / cellPx);
            const ngy = Math.floor((ny - offsetY) / cellPx);
            if (field.inBounds(ngx, ngy) && field.isWall(ngx, ngy)) {
              let sx = x;
              let sy = y;
              const tryX = Math.floor((nx - offsetX) / cellPx);
              const tryY = Math.floor((y - offsetY) / cellPx);
              if (field.inBounds(tryX, tryY) && !field.isWall(tryX, tryY)) sx = nx;
              const tryX2 = Math.floor((sx - offsetX) / cellPx);
              const tryY2 = Math.floor((ny - offsetY) / cellPx);
              if (field.inBounds(tryX2, tryY2) && !field.isWall(tryX2, tryY2)) sy = ny;
              nx = sx;
              ny = sy;
              vx *= 0.35;
              vy *= 0.35;
            }

            posX[i] = nx;
            posY[i] = ny;
            velX[i] = vx;
            velY[i] = vy;

            particles[i].x = nx;
            particles[i].y = ny;
          }
        };

        return updateSwarm;
      };

      computeLayout();
      rebuildField();
      let updateSwarm = rebuildSwarm();

      const ensureBaseAndEdgeOpen = () => {
        const tx = Math.floor(field.width / 2);
        const ty = Math.floor(field.height / 2);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = tx + dx;
            const y = ty + dy;
            if (!field.inBounds(x, y)) continue;
            field.setWall(x, y, false);
          }
        }
        for (let x = 0; x < field.width; x++) {
          field.setWall(x, 0, false);
          field.setWall(x, field.height - 1, false);
        }
        for (let y = 0; y < field.height; y++) {
          field.setWall(0, y, false);
          field.setWall(field.width - 1, y, false);
        }
      };

      const applyPilot = (p: ZTidePilot | null | undefined) => {
        pilotRequestId += 1;
        const reqId = pilotRequestId;
        if (!p) {
          baseCost = null;
          field.cost.fill(0);
          ensureBaseAndEdgeOpen();
          field.generate(Math.floor(field.width / 2), Math.floor(field.height / 2));
          renderHeat();
          renderWalls();
          renderVectors();
          renderOverlay();
          return;
        }

        (async () => {
          try {
            const grid = await mapDataService.getBattleGridFromOSM({
              center: p.coords,
              gridSize: field.width,
              worldMeters: 1024,
            });
            if (destroyed || reqId !== pilotRequestId) return;
            baseCost = grid.cost;
            if (baseCost.length === field.cost.length) {
              field.cost.set(baseCost);
            } else {
              field.cost.fill(0);
            }
            ensureBaseAndEdgeOpen();
            field.generate(Math.floor(field.width / 2), Math.floor(field.height / 2));
            renderHeat();
            renderWalls();
            renderVectors();
            renderOverlay();
          } catch {
            if (destroyed || reqId !== pilotRequestId) return;
            baseCost = null;
            field.cost.fill(0);
            ensureBaseAndEdgeOpen();
            field.generate(Math.floor(field.width / 2), Math.floor(field.height / 2));
            renderHeat();
            renderWalls();
            renderVectors();
            renderOverlay();
          }
        })();
      };

      applyPilot(pilotRef.current);

      const startWave = () => {
        wave += 1;
        waveActive = true;
        baseHp = baseHpMax;
        fireCooldown = 0;
        waveEndsAt = performance.now() + waveDurationMs;
        updateSwarm = rebuildSwarm();
      };

      const setGridSize = (newSize: number) => {
        const size = Math.max(24, Math.min(128, Math.floor(newSize)));
        field = new FlowField({ width: size, height: size });
        baseCost = null;
        rebuildField();
        applyPilot(pilotRef.current);
        updateSwarm = rebuildSwarm();
      };

      const setEntityCount = (n: number) => {
        entitiesRef.current = Math.max(0, Math.floor(n));
        updateSwarm = rebuildSwarm();
      };

      const editAtClient = (clientX: number, clientY: number) => {
        const rect = app.canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (app.renderer.width / rect.width);
        const y = (clientY - rect.top) * (app.renderer.height / rect.height);
        const gx = Math.floor((x - offsetX) / cellPx);
        const gy = Math.floor((y - offsetY) / cellPx);
        if (!field.inBounds(gx, gy)) return;

        const isErase = brushModeRef.current === 'ERASE';
        if (gx === field.targetX && gy === field.targetY) return;
        if (waveActive && !isErase && gold <= 0) return;
        field.setWall(gx, gy, !isErase);
        if (waveActive && !isErase) gold = Math.max(0, gold - 1);
        field.generate(field.targetX, field.targetY);
        renderHeat();
        renderWalls();
        renderVectors();
        renderOverlay();
      };

      const pointer = { down: false };
      const onDown = (e: PointerEvent) => {
        pointer.down = true;
        editAtClient(e.clientX, e.clientY);
      };
      const onUp = () => {
        pointer.down = false;
      };
      const onMove = (e: PointerEvent) => {
        if (!pointer.down) return;
        editAtClient(e.clientX, e.clientY);
      };

      app.canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('pointermove', onMove);

      const onResize = () => {
        computeLayout();
        renderHeat();
        renderWalls();
        renderVectors();
        renderOverlay();
      };

      app.renderer.on('resize', onResize);

      teardown = () => {
        try {
          app.canvas.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          window.removeEventListener('pointermove', onMove);
          app.renderer.off('resize', onResize);
        } catch {
        }
        if (particleTexture !== Texture.WHITE) {
          try {
            particleTexture.destroy(true);
          } catch {
          }
        }
      };

      app.ticker.add(() => {
        if (pausedRef.current) return;

        const now = performance.now();
        const frameMs = now - lastFrameAtRef.current;
        lastFrameAtRef.current = now;
        const dt = Math.min(0.05, Math.max(0.001, frameMs / 1000));

        if (waveActive && now >= waveEndsAt) {
          waveActive = false;
        }
        if (waveActive && baseHp <= 0) {
          waveActive = false;
        }
        updateSwarm(dt);

        if (now - lastPerfAtRef.current >= 250) {
          lastPerfAtRef.current = now;
          onPerfSample({
            fps: app.ticker.FPS,
            frameMs,
            entities: entitiesRef.current,
            baseHp,
            baseHpMax,
            gold,
            wave,
            waveActive,
            waveRemainingMs: waveActive ? Math.max(0, waveEndsAt - now) : 0,
          });
        }
      });

      setGridSizeRef.current = setGridSize;
      setEntityCountRef.current = setEntityCount;
      startWaveRef.current = startWave;
      rerenderDebugRef.current = () => {
        renderHeat();
        renderVectors();
      };
      applyPilotRef.current = applyPilot;
    };

    initPromiseRef.current = init();

    return () => {
      destroyed = true;
      teardown?.();
      const wasReady = appReadyRef.current;
      appReadyRef.current = false;
      const doDestroy = () => {
        if (!appRef.current) return;
        try {
          if (appRef.current.canvas.parentElement) {
            appRef.current.canvas.parentElement.removeChild(appRef.current.canvas);
          }
        } catch {
        }
        try {
          appRef.current.destroy(true, { children: true });
        } catch {
        }
        appRef.current = null;
      };
      if (wasReady) {
        doDestroy();
      } else {
        initPromiseRef.current?.then(() => doDestroy()).catch(() => doDestroy());
      }
    };
  }, [effectiveResolution, onPerfSample]);

  useEffect(() => {
    const app = appRef.current;
    if (!app || !appReadyRef.current) return;
    const renderer = (app as any).renderer;
    if (!renderer) return;
    renderer.resolution = effectiveResolution;
    renderer.resize(renderer.width, renderer.height);
  }, [effectiveResolution]);

  useEffect(() => {
    setGridSizeRef.current?.(gridSize);
  }, [gridSize]);

  useEffect(() => {
    setEntityCountRef.current?.(entityCount);
  }, [entityCount]);

  useEffect(() => {
    pilotRef.current = pilot;
    applyPilotRef.current?.(pilot);
  }, [pilot]);

  useEffect(() => {
    if (waveToken <= 0) return;
    startWaveRef.current?.();
  }, [waveToken]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    densityThresholdRef.current = densityThreshold;
  }, [densityThreshold]);

  useEffect(() => {
    pressureStrengthRef.current = pressureStrength;
  }, [pressureStrength]);

  useEffect(() => {
    brushModeRef.current = brushMode;
  }, [brushMode]);

  useEffect(() => {
    debugLayerRef.current = debugLayer;
    rerenderDebugRef.current?.();
  }, [debugLayer]);

  return <div ref={hostRef} className="absolute inset-0" />;
};

export default ZTideCanvas;
