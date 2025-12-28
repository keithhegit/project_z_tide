import React, { useEffect, useMemo, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';

type PerfSample = {
  fps: number;
  frameMs: number;
  entities: number;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ZTideCanvas: React.FC<{
  paused: boolean;
  resolutionScale: number;
  onPerfSample: (sample: PerfSample) => void;
}> = ({ paused, resolutionScale, onPerfSample }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const lastPerfAtRef = useRef<number>(0);
  const lastFrameAtRef = useRef<number>(performance.now());
  const entitiesRef = useRef<number>(0);

  const effectiveResolution = useMemo(() => {
    const dpr = window.devicePixelRatio || 1;
    return clamp(dpr * resolutionScale, 1, 2);
  }, [resolutionScale]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    appRef.current = app;

    let destroyed = false;

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

      host.appendChild(app.canvas);

      const root = new Container();
      app.stage.addChild(root);

      const dots = new Container();
      root.addChild(dots);

      const dotCount = 500;
      entitiesRef.current = dotCount;

      const dotGfx: Graphics[] = [];
      const vel = new Float32Array(dotCount * 2);

      for (let i = 0; i < dotCount; i++) {
        const g = new Graphics();
        g.circle(0, 0, 2);
        g.fill(0xef4444);
        g.x = Math.random() * app.renderer.width;
        g.y = Math.random() * app.renderer.height;
        vel[i * 2 + 0] = (Math.random() * 2 - 1) * 1.2;
        vel[i * 2 + 1] = (Math.random() * 2 - 1) * 1.2;
        dots.addChild(g);
        dotGfx.push(g);
      }

      const grid = new Graphics();
      grid.alpha = 0.08;
      root.addChildAt(grid, 0);

      const renderGrid = () => {
        const w = app.renderer.width;
        const h = app.renderer.height;
        grid.clear();
        grid.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.15 });
        const step = 48;
        for (let x = 0; x <= w; x += step) {
          grid.moveTo(x, 0);
          grid.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += step) {
          grid.moveTo(0, y);
          grid.lineTo(w, y);
        }
        grid.stroke();
      };

      renderGrid();

      app.renderer.on('resize', () => {
        renderGrid();
      });

      const pointer = { down: false, lastX: 0, lastY: 0 };
      app.canvas.addEventListener('pointerdown', (e) => {
        pointer.down = true;
        pointer.lastX = e.clientX;
        pointer.lastY = e.clientY;
      });
      window.addEventListener('pointerup', () => {
        pointer.down = false;
      });
      window.addEventListener('pointermove', (e) => {
        if (!pointer.down) return;
        const dx = e.clientX - pointer.lastX;
        const dy = e.clientY - pointer.lastY;
        pointer.lastX = e.clientX;
        pointer.lastY = e.clientY;
        for (let i = 0; i < dotGfx.length; i++) {
          dotGfx[i].x += dx;
          dotGfx[i].y += dy;
        }
      });

      app.ticker.add(() => {
        if (paused) return;

        const now = performance.now();
        const frameMs = now - lastFrameAtRef.current;
        lastFrameAtRef.current = now;

        const w = app.renderer.width;
        const h = app.renderer.height;

        for (let i = 0; i < dotCount; i++) {
          const g = dotGfx[i];
          const vx = vel[i * 2 + 0];
          const vy = vel[i * 2 + 1];
          let nx = g.x + vx;
          let ny = g.y + vy;
          if (nx < 0 || nx > w) {
            vel[i * 2 + 0] = -vx;
            nx = clamp(nx, 0, w);
          }
          if (ny < 0 || ny > h) {
            vel[i * 2 + 1] = -vy;
            ny = clamp(ny, 0, h);
          }
          g.x = nx;
          g.y = ny;
        }

        if (now - lastPerfAtRef.current >= 250) {
          lastPerfAtRef.current = now;
          onPerfSample({
            fps: app.ticker.FPS,
            frameMs,
            entities: entitiesRef.current,
          });
        }
      });
    };

    init();

    return () => {
      destroyed = true;
      if (appRef.current) {
        try {
          if (appRef.current.canvas.parentElement) {
            appRef.current.canvas.parentElement.removeChild(appRef.current.canvas);
          }
        } catch {
        }
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [effectiveResolution, onPerfSample, paused]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.resolution = effectiveResolution;
    app.renderer.resize(app.renderer.width, app.renderer.height);
  }, [effectiveResolution]);

  return <div ref={hostRef} className="absolute inset-0" />;
};

export default ZTideCanvas;

