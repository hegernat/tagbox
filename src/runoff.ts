import type { Dab, Point, Stroke } from './settings';

interface Channel {
  x: number;
  y: number;
  width: number;
  length: number;
  maxLength: number;
  speed: number;
  age: number;
  seed: number;
}

interface Run {
  kind: 'drop' | 'sheet';
  channels: Channel[];
  color: [number, number, number];
}

interface CandidateState {
  lastDab: Point;
  lastCandidate: Dab;
  lastCandidateAt: number;
  pathLength: number;
  distanceSinceCandidate: number;
  loadSum: number;
  paintLoadSum: number;
  samples: number;
  attempts: number;
  dwellEvents: number;
  speedSum: number;
}

/** Sparse paint channels and joined runoff sheets, grouped by their source stroke. */
export class RunoffEngine {
  private readonly byStroke = new Map<Stroke, Run[]>();
  private readonly candidates = new Map<Stroke, CandidateState>();
  private readonly geometryCache = new Map<Stroke, Float32Array>();
  private intensity = 0.58;

  setIntensity(value: number): void { this.intensity = Math.max(0, Math.min(1, value)); }

  addDabs(stroke: Stroke, dabs: Dab[], now: number, canvasHeight: number): void {
    if (!dabs.length) return;
    let runs = this.byStroke.get(stroke);
    if (!runs) { runs = []; this.byStroke.set(stroke, runs); }
    let state = this.candidates.get(stroke);

    for (const dab of dabs) {
      if (!state) {
        state = {
          lastDab: { x: dab.x, y: dab.y }, lastCandidate: dab,
          lastCandidateAt: now, pathLength: 0, distanceSinceCandidate: 0, loadSum: dab.load,
          paintLoadSum: dab.paintLoad, samples: 1, attempts: 0, dwellEvents: 0, speedSum: dab.speed,
        };
        this.candidates.set(stroke, state);
        continue;
      }

      const distance = Math.hypot(dab.x - state.lastDab.x, dab.y - state.lastDab.y);
      state.pathLength += distance;
      state.distanceSinceCandidate += distance;
      state.lastDab = { x: dab.x, y: dab.y };
      state.loadSum += dab.load;
      state.paintLoadSum += dab.paintLoad;
      state.speedSum += dab.speed;
      state.samples++;

      const spacing = Math.max(16, stroke.size * 1.5);
      const movedEnough = state.distanceSinceCandidate >= spacing;
      const restedEnough = state.samples >= 4 && now - state.lastCandidateAt >= 420;
      if (!movedEnough && !restedEnough) continue;

      const averageLoad = state.loadSum / state.samples;
      const averagePaintLoad = state.paintLoadSum / state.samples;
      const averageSpeed = state.speedSum / state.samples;
      const dryness = 1 - averagePaintLoad;
      const dwell = Math.min(0.24, Math.max(0, state.samples - 1) * 0.04);
      const intensityScale = 0.12 + this.intensity * 1.42;
      const speedScale = 1.18 - averageSpeed * 0.78;
      const baseChance = 0.035 + averageLoad * 0.48 + averagePaintLoad * 0.16 + dryness * 0.12 + dwell;
      const chance = Math.max(0, Math.min(0.9, baseChance * intensityScale * speedScale));
      const pathCapacity = Math.floor((state.pathLength / spacing) * (0.25 + this.intensity * 1.25));
      if (restedEnough) state.dwellEvents++;
      const dwellCapacity = state.dwellEvents;
      const maxForStroke = Math.max(1, pathCapacity + dwellCapacity);
      const candidate = movedEnough ? dab : state.lastCandidate;
      if (state.attempts < maxForStroke && Math.random() < chance) {
        if (this.spawn(runs, stroke, candidate, averageLoad, averagePaintLoad, averageSpeed, canvasHeight)) state.attempts++;
      }
      state.lastCandidate = movedEnough ? dab : state.lastCandidate;
      state.lastCandidateAt = now;
      state.distanceSinceCandidate = 0;
      state.loadSum = 0;
      state.paintLoadSum = 0;
      state.samples = 0;
      state.speedSum = 0;
    }
    this.geometryCache.delete(stroke);
  }

  private spawn(runs: Run[], stroke: Stroke, dab: Dab, load: number, paintLoad: number, speed: number, canvasHeight: number): boolean {
    const dry = 1 - paintLoad;
    const isSheet = dry > 0.26 && Math.random() < dry * (0.52 + this.intensity * 0.32);
    const channelWidth = Math.max(0.55, stroke.size * (isSheet ? 0.045 + paintLoad * 0.025 : 0.045 + paintLoad * 0.075));
    const channelCount = isSheet ? Math.round(3 + this.intensity * 4) : 1;
    const channels: Channel[] = [];
    const lengthFactor = (0.35 + this.intensity * 0.9) * (0.38 + paintLoad * 0.72);

    for (let i = 0; i < channelCount; i++) {
      const origin = this.samplePaintCoverage(dab, stroke, channelWidth * 0.55);
      if (!origin) continue;
      const available = Math.max(0, canvasHeight - origin.y);
      if (available < 3) continue;
      const fast = 20 + Math.random() * 20;
      const medium = 40 + Math.random() * 60;
      const slow = 100 + Math.random() * 100;
      const still = 170 + Math.random() * 110;
      const requested = (speed < 0.035 ? still : speed < 0.3 ? slow : speed < 0.68 ? medium : fast) * lengthFactor;
      channels.push({
        x: origin.x,
        y: origin.y,
        width: channelWidth,
        length: 0,
        maxLength: Math.min(available, Math.max(requested, stroke.size * 0.8)),
        speed: (12 + load * 54) * (0.85 + Math.random() * 0.3),
        age: 0,
        seed: Math.random() * Math.PI * 2,
      });
    }
    if (!channels.length) return false;

    if (isSheet) {
      const nearby = runs.find((run) => run.kind === 'sheet' && this.canJoin(run, channels, stroke.size));
      if (nearby) {
        nearby.channels.push(...channels);
        return true;
      }
    }

    runs.push({ kind: isSheet ? 'sheet' : 'drop', channels, color: this.parseColor(stroke.color) });
    return true;
  }

  private canJoin(run: Run, incoming: Channel[], brushSize: number): boolean {
    const existingMinY = Math.min(...run.channels.map((channel) => channel.y));
    const existingMaxY = Math.max(...run.channels.map((channel) => channel.y));
    const incomingMinY = Math.min(...incoming.map((channel) => channel.y));
    const incomingMaxY = Math.max(...incoming.map((channel) => channel.y));
    if (Math.max(existingMinY, incomingMinY) - Math.min(existingMaxY, incomingMaxY) > brushSize * 1.4) return false;
    const existingLeft = Math.min(...run.channels.map((channel) => channel.x - channel.width * 0.5));
    const existingRight = Math.max(...run.channels.map((channel) => channel.x + channel.width * 0.5));
    const incomingLeft = Math.min(...incoming.map((channel) => channel.x - channel.width * 0.5));
    const incomingRight = Math.max(...incoming.map((channel) => channel.x + channel.width * 0.5));
    const horizontalGap = Math.max(0, Math.max(existingLeft, incomingLeft) - Math.min(existingRight, incomingRight));
    return horizontalGap <= brushSize * 1.2;
  }

  /** Samples the lower contour inside the exact dab primitive used for the stroke. */
  private samplePaintCoverage(dab: Dab, stroke: Stroke, inset: number): Point | null {
    const size = stroke.size;
    const pointSize = stroke.shape === 'chisel' ? size * 1.8 : stroke.shape === 'square' ? size + 2 : size;
    const half = size * 0.5;
    const angle = stroke.rotation;
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    if (stroke.shape === 'round') {
      const radius = Math.max(0, half - inset);
      if (radius <= 0) return null;
      const localX = (Math.random() * 2 - 1) * radius;
      const localY = -Math.sqrt(Math.max(0, radius * radius - localX * localX));
      return { x: dab.x + localX, y: dab.y - localY };
    }
    if (stroke.shape === 'square') {
      const interiorHalf = Math.max(0, half - inset);
      if (interiorHalf <= 0) return null;
      const localX = (Math.random() * 2 - 1) * interiorHalf;
      const localY = -interiorHalf;
      return { x: dab.x + localX, y: dab.y - localY };
    }

    const majorRadius = Math.max(0, size * 0.9 - inset);
    const minorRadius = Math.max(0, size * 0.35 - inset);
    if (majorRadius <= 0 || minorRadius <= 0) return null;
    for (let attempt = 0; attempt < 32; attempt++) {
      const contourAngle = Math.PI + Math.random() * Math.PI;
      const qx = (majorRadius / pointSize) * Math.cos(contourAngle);
      const qy = (minorRadius / pointSize) * Math.sin(contourAngle);
      const px = c * qx - s * qy;
      const py = s * qx + c * qy;
      if (py < 0) return { x: dab.x + px * pointSize, y: dab.y - py * pointSize };
    }
    return null;
  }

  advance(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.05);
    for (const [stroke, runs] of this.byStroke) {
      let changed = false;
      for (const run of runs) for (const channel of run.channels) {
        if (channel.length >= channel.maxLength) continue;
        channel.age += dt;
        const variation = 0.92 + 0.08 * Math.sin(channel.age * 2.1 + channel.seed);
        channel.length = Math.min(channel.maxLength, channel.length + channel.speed * variation * dt);
        changed = true;
      }
      if (changed) this.geometryCache.delete(stroke);
    }
  }

  hasGrowingRuns(): boolean {
    for (const runs of this.byStroke.values()) if (runs.some((run) => run.channels.some((channel) => channel.length < channel.maxLength))) return true;
    return false;
  }

  retain(strokes: readonly Stroke[]): void {
    const keep = new Set(strokes);
    for (const stroke of this.byStroke.keys()) if (!keep.has(stroke)) { this.byStroke.delete(stroke); this.geometryCache.delete(stroke); }
    for (const stroke of this.candidates.keys()) if (!keep.has(stroke)) this.candidates.delete(stroke);
  }

  clear(): void { this.byStroke.clear(); this.candidates.clear(); this.geometryCache.clear(); }

  geometry(stroke: Stroke): Float32Array {
    const cached = this.geometryCache.get(stroke);
    if (cached) return cached;
    const vertices: number[] = [];
    for (const run of this.byStroke.get(stroke) ?? []) {
      if (run.kind === 'sheet') this.appendSheet(vertices, run);
      else for (const channel of run.channels) this.appendDrop(vertices, channel, run.color);
    }
    const geometry = new Float32Array(vertices);
    this.geometryCache.set(stroke, geometry);
    return geometry;
  }

  private appendDrop(vertices: number[], channel: Channel, color: [number, number, number]): void {
    if (channel.length <= 0) return;
    const tipRadius = channel.width * 0.62;
    const bodyLength = Math.max(0, channel.length - tipRadius);
    const segments = Math.max(2, Math.min(48, Math.ceil(bodyLength / 4)));
    const sections: Array<{ y: number; half: number }> = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const taper = 0.84 + 0.12 * Math.sin(t * Math.PI);
      const tipBulge = t > 0.78 ? 1 + 0.22 * ((t - 0.78) / 0.22) : 1;
      sections.push({ y: channel.y + bodyLength * t, half: channel.width * taper * tipBulge * 0.5 });
    }
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i]; const b = sections[i + 1];
      const al = [channel.x - a.half, a.y]; const ar = [channel.x + a.half, a.y];
      const bl = [channel.x - b.half, b.y]; const br = [channel.x + b.half, b.y];
      this.triangle(vertices, al, ar, bl, color);
      this.triangle(vertices, ar, br, bl, color);
    }
    const tip = sections[sections.length - 1];
    this.appendCap(vertices, channel.x, tip.y, tipRadius, color);
  }

  /** Joins adjacent channel starts into one continuously filled runoff sheet. */
  private appendSheet(vertices: number[], run: Run): void {
    const channels = run.channels.filter((channel) => channel.length > 0);
    if (!channels.length) return;
    const startY = Math.min(...channels.map((channel) => channel.y));
    const endY = Math.max(...channels.map((channel) => channel.y + channel.length));
    const step = 3;
    const sections: Array<{ y: number; left: number; right: number }> = [];
    for (let y = startY; y <= endY + step; y += step) {
      const active = channels.filter((channel) => y >= channel.y && y <= channel.y + channel.length);
      if (!active.length) continue;
      const left = Math.min(...active.map((channel) => channel.x - channel.width * 0.5));
      const right = Math.max(...active.map((channel) => channel.x + channel.width * 0.5));
      sections.push({ y: Math.min(y, endY), left, right });
    }
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i]; const b = sections[i + 1];
      this.triangle(vertices, [a.left, a.y], [a.right, a.y], [b.left, b.y], run.color);
      this.triangle(vertices, [a.right, a.y], [b.right, b.y], [b.left, b.y], run.color);
    }
    const bottom = sections[sections.length - 1];
    if (bottom) this.appendCap(vertices, (bottom.left + bottom.right) * 0.5, bottom.y, (bottom.right - bottom.left) * 0.5, run.color);
  }

  private appendCap(vertices: number[], x: number, y: number, radius: number, color: [number, number, number]): void {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const b = ((i + 1) / count) * Math.PI * 2;
      this.triangle(vertices, [x, y], [x + Math.cos(a) * radius, y + Math.sin(a) * radius], [x + Math.cos(b) * radius, y + Math.sin(b) * radius], color);
    }
  }

  private triangle(vertices: number[], a: number[], b: number[], c: number[], color: [number, number, number]): void {
    for (const point of [a, b, c]) vertices.push(point[0], point[1], color[0], color[1], color[2]);
  }

  private parseColor(hex: string): [number, number, number] {
    const value = hex.replace('#', '');
    return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
  }
}
