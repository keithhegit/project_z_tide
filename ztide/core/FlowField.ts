export type FlowFieldSize = {
  width: number;
  height: number;
};

export const FLOW_DIR_NONE = 255;

const INF = 0xffff;

const N4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const N8 = [
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
];

export const DIR_TO_VEC = [
  { x: 1, y: 0 },
  { x: 0.70710678, y: 0.70710678 },
  { x: 0, y: 1 },
  { x: -0.70710678, y: 0.70710678 },
  { x: -1, y: 0 },
  { x: -0.70710678, y: -0.70710678 },
  { x: 0, y: -1 },
  { x: 0.70710678, y: -0.70710678 },
];

export class FlowField {
  readonly width: number;
  readonly height: number;
  readonly cost: Uint8Array;
  readonly integration: Uint16Array;
  readonly direction: Uint8Array;

  targetX: number = 0;
  targetY: number = 0;

  private queue: Int32Array;

  constructor(size: FlowFieldSize) {
    this.width = size.width;
    this.height = size.height;
    const n = this.width * this.height;
    this.cost = new Uint8Array(n);
    this.integration = new Uint16Array(n);
    this.direction = new Uint8Array(n);
    this.queue = new Int32Array(n);
    this.clear();
  }

  clear() {
    this.cost.fill(0);
    this.integration.fill(INF);
    this.direction.fill(FLOW_DIR_NONE);
  }

  idx(x: number, y: number) {
    return y * this.width + x;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isWall(x: number, y: number) {
    return this.cost[this.idx(x, y)] === 255;
  }

  private canUseDiagonal(x: number, y: number, dx: number, dy: number) {
    if (dx === 0 || dy === 0) return true;
    const ax = x + dx;
    const ay = y;
    const bx = x;
    const by = y + dy;
    if (!this.inBounds(ax, ay) || !this.inBounds(bx, by)) return false;
    return !this.isWall(ax, ay) && !this.isWall(bx, by);
  }

  setWall(x: number, y: number, wall: boolean) {
    this.cost[this.idx(x, y)] = wall ? 255 : 0;
  }

  generate(targetX: number, targetY: number) {
    this.targetX = targetX;
    this.targetY = targetY;

    const n = this.width * this.height;
    this.integration.fill(INF);
    this.direction.fill(FLOW_DIR_NONE);

    if (!this.inBounds(targetX, targetY)) return;
    if (this.isWall(targetX, targetY)) return;

    const q = this.queue;
    let head = 0;
    let tail = 0;

    const startIdx = this.idx(targetX, targetY);
    this.integration[startIdx] = 0;
    q[tail++] = startIdx;

    while (head < tail) {
      const curIdx = q[head++];
      const curDist = this.integration[curIdx];
      const cx = curIdx % this.width;
      const cy = (curIdx / this.width) | 0;

      const nextDist = (curDist + 1) & 0xffff;
      for (let i = 0; i < N4.length; i++) {
        const nx = cx + N4[i].dx;
        const ny = cy + N4[i].dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = ny * this.width + nx;
        if (this.cost[ni] === 255) continue;
        if (nextDist < this.integration[ni]) {
          this.integration[ni] = nextDist;
          q[tail++] = ni;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (this.cost[i] === 255) continue;
      const d = this.integration[i];
      if (d === INF || d === 0) continue;

      const x = i % this.width;
      const y = (i / this.width) | 0;

      let best = d;
      let bestDir = FLOW_DIR_NONE;

      for (let dir = 0; dir < N8.length; dir++) {
        const nx = x + N8[dir].dx;
        const ny = y + N8[dir].dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!this.canUseDiagonal(x, y, N8[dir].dx, N8[dir].dy)) continue;
        const ni = ny * this.width + nx;
        const nd = this.integration[ni];
        if (nd < best) {
          best = nd;
          bestDir = dir;
        }
      }

      this.direction[i] = bestDir;
    }
  }
}
