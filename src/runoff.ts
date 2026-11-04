import type { Dab, Point, SplatterParticle, Stroke } from './settings';

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
  splatterPoint: Point;
  splatterDistance: number;
  randomSeed: number;
}

/** Sparse paint channels and joined runoff sheets, grouped by their source stroke. */
export class RunoffEngine {
  private readonly byStroke = new Map<Stroke, Run[]>();
  private readonly candidates = new Map<Stroke, CandidateState>();
  private readonly geometryCache = new Map<Stroke, Float32Array>();
  private intensity = 0.58;

  setIntensity(value: number): void { this.intensity = Math.max(0, Math.min(1, value)); }

  addDabs(stroke: Stroke, dabs: Dab[], now: number, canvasWidth: number, canvasHeight: number): void {
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
          splatterPoint: { x: dab.x, y: dab.y }, splatterDistance: 0,
          randomSeed: this.seedForStroke(stroke, dab),
        };
        this.candidates.set(stroke, state);
        continue;
      }

      const distance = Math.hypot(dab.x - state.lastDab.x, dab.y - state.lastDab.y);
      state.pathLength += distance;
      state.distanceSinceCandidate += distance;
      state.lastDab = { x: dab.x, y: dab.y };
      state.splatterDistance += distance;
      const splatterSpacing = Math.max(16, Math.min(48, stroke.size * 0.75));
      if (state.splatterDistance >= splatterSpacing) {
        const travelX = dab.x - state.splatterPoint.x;
        const travelY = dab.y - state.splatterPoint.y;
        this.trySpawnSplatter(stroke, dab, travelX, travelY, state);
        state.splatterPoint = { x: dab.x, y: dab.y };
        state.splatterDistance %= splatterSpacing;
      }
      state.loadSum += dab.load;
      state.paintLoadSum += dab.paintLoad;
      state.speedSum += dab.speed;
      state.samples++;

      const spacing = Math.max(8, Math.min(32, stroke.size * 0.6));
      const movedEnough = state.distanceSinceCandidate >= spacing;
      const restedEnough = state.samples >= 4 && now - state.lastCandidateAt >= 420;
      if (!movedEnough && !restedEnough) continue;

      const averageLoad = state.loadSum / state.samples;
      const averagePaintLoad = state.paintLoadSum / state.samples;
      const averageSpeed = state.speedSum / state.samples;
      const dwell = Math.min(0.24, Math.max(0, state.samples - 1) * 0.04);
      const intensityScale = 0.08 + this.intensity * 1.75;
      const speedScale = 1.18 - averageSpeed * 0.78;
      // Intensity controls event frequency; paint load selects runoff style later.
      const baseChance = 0.18 + dwell * 0.35;
      const wetSpawnBoost = 1 + Math.max(0, averagePaintLoad - 0.5) * 1.2;
      const chance = Math.max(0, Math.min(0.9, baseChance * intensityScale * speedScale * wetSpawnBoost));
      const pathCapacity = Math.floor((state.pathLength / spacing) * (0.08 + this.intensity * 1.65));
      if (restedEnough) state.dwellEvents++;
      const dwellCapacity = state.dwellEvents;
      const maxForStroke = Math.max(1, pathCapacity + dwellCapacity);
      const candidate = movedEnough ? dab : state.lastCandidate;
      if (this.intensity > 0 && state.attempts < maxForStroke && Math.random() < chance) {
        if (this.spawn(runs, stroke, candidate, averageLoad, averagePaintLoad, averageSpeed, canvasWidth, canvasHeight)) state.attempts++;
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

  private seedForStroke(stroke: Stroke, dab: Dab): number {
    const x = Math.floor(dab.x * 10);
    const y = Math.floor(dab.y * 10);
    let colorHash = 2166136261;
    for (const character of stroke.color) colorHash = Math.imul(colorHash ^ character.charCodeAt(0), 16777619);
    const seed = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(Math.floor(stroke.size * 10), 83492791) ^ Math.floor(stroke.rotation * 1e6) ^ colorHash) >>> 0;
    return seed || 1;
  }

  private random(state: CandidateState): number {
    state.randomSeed = (Math.imul(state.randomSeed, 1664525) + 1013904223) >>> 0;
    return state.randomSeed / 0x100000000;
  }

  private trySpawnSplatter(stroke: Stroke, dab: Dab, travelX: number, travelY: number, state: CandidateState): void {
    if (this.intensity === 0) return;
    const velocity = dab.velocity ?? 0;
    if (velocity < 500) return;
    const speedFactor = Math.max(0, Math.min(1, (velocity - 500) / 1200));
    const dryness = 1 - dab.paintLoad;
    const intensityFactor = 0.2 + this.intensity * 0.8;
    if (stroke.splatterEnabled === false) return;
    // Wet load yields more, smaller droplets; dry load keeps fewer irregular flecks.
    const probability = 0.30 * speedFactor * intensityFactor * (0.42 + dab.paintLoad * 0.58);
    if (this.random(state) >= probability) return;

    const random = (): number => this.random(state);
    const origin = this.samplePaintInterior(dab, stroke, random);
    const travelLength = Math.hypot(travelX, travelY);
    const tangentX = travelLength > 0.001 ? travelX / travelLength : 0;
    const tangentY = travelLength > 0.001 ? travelY / travelLength : 0;
    const randomAngle = random() * Math.PI * 2;
    let directionX = Math.cos(randomAngle) * 0.62 - tangentX * 0.38;
    let directionY = Math.sin(randomAngle) * 0.55 - tangentY * 0.22 + 0.48;
    const directionLength = Math.hypot(directionX, directionY) || 1;
    directionX /= directionLength;
    directionY /= directionLength;
    const launchSpeed = 220 + speedFactor * 360 + random() * 160;
    const radius = Math.max(0.8, Math.min(4.8, (1.0 + speedFactor * 1.55) * (0.82 + dryness * 0.42) * (0.82 + random() * 0.44)));
    const lifetime = 0.05 + random() * 0.10;
    const secondaryChance = dab.paintLoad < 0.55 ? 0.045 + this.intensity * 0.065 : 0.012 + this.intensity * 0.025;
    const secondaryRunoff = radius >= 3.1 && random() < secondaryChance ? {
      x: origin.x, y: origin.y, width: Math.max(0.55, radius * 0.16), length: 0,
      maxLength: 5 + random() * 12, speed: 90 + random() * 85, age: 0,
      seed: random() * Math.PI * 2, started: false,
    } : undefined;
    const particles = stroke.splatter ?? (stroke.splatter = []);
    particles.push({
      x: origin.x, y: origin.y, originX: origin.x, originY: origin.y,
      vx: directionX * launchSpeed,
      vy: directionY * launchSpeed,
      radius,
      aspect: 1 + dryness * random() * 0.72,
      age: 0,
      lifetime,
      gravity: 700 + dryness * 350,
      secondaryRunoff,
    });
    this.geometryCache.delete(stroke);
  }

  private samplePaintInterior(dab: Dab, stroke: Stroke, random: () => number): Point {
    const size = dab.size;
    const angle = dab.angle ?? stroke.rotation;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (stroke.shape === 'round') {
      const radius = size * 0.46 * Math.sqrt(random());
      const theta = random() * Math.PI * 2;
      return { x: dab.x + radius * Math.cos(theta), y: dab.y - radius * Math.sin(theta) };
    }
    if (stroke.shape === 'square') {
      const qx = (random() * 2 - 1) * size * 0.46;
      const qy = (random() * 2 - 1) * size * 0.46;
      return { x: dab.x + c * qx - s * qy, y: dab.y - (s * qx + c * qy) };
    }
    if (stroke.shape === 'split-chisel') {
      const segment = random() < 1 / 3 ? [-size * 0.9, -size * 0.36] : [-size * 0.18, size * 0.9];
      const qx = segment[0] + random() * (segment[1] - segment[0]);
      const qy = (random() * 2 - 1) * size * 0.31 * 0.9;
      return { x: dab.x + c * qx - s * qy, y: dab.y - (s * qx + c * qy) };
    }
    const radial = Math.sqrt(random());
    const theta = random() * Math.PI * 2;
    const qx = size * 0.82 * radial * Math.cos(theta);
    const qy = size * 0.30 * radial * Math.sin(theta);
    return { x: dab.x + c * qx - s * qy, y: dab.y - (s * qx + c * qy) };
  }

  private spawn(runs: Run[], stroke: Stroke, dab: Dab, load: number, paintLoad: number, speed: number, canvasWidth: number, canvasHeight: number): boolean {
    if (this.intensity === 0) return false;
    const dry = 1 - paintLoad;
    const isSheet = Math.random() < 0.02 + dry * 0.80;
    const baseWidth = stroke.size * (isSheet ? 0.055 + dry * 0.12 : 0.032 + paintLoad * 0.022 + paintLoad * paintLoad * 0.012);
    const channelCount = isSheet ? Math.round(3 + this.intensity * 4) : 1 + Math.floor(paintLoad * this.intensity * 2.5);
    const channels: Channel[] = [];
    const lengthFactor = 0.15 + this.intensity * 1.25;

    for (let i = 0; i < channelCount; i++) {
      const widthVariation = isSheet ? 0.6 + Math.random() * (0.5 + dry * 0.7) : 0.8 + Math.random() * (0.4 + dry * 0.4);
      const channelWidth = Math.max(0.55, baseWidth * widthVariation);
      const origin = this.samplePaintCoverage(dab, stroke, channelWidth * 0.55);
      if (!origin || !this.pointInsideDab(dab, stroke, origin.x, origin.y)) continue;
      if (origin.x < 0 || origin.x >= canvasWidth || origin.y < 0 || origin.y >= canvasHeight) continue;
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
    const size = dab.size;
    const pointSize = stroke.shape === 'chisel' ? size * 1.8 : stroke.shape === 'square' ? size + 2 : size;
    const half = size * 0.5;
    const angle = dab.angle ?? stroke.rotation;
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
      const c = Math.cos(angle); const s = Math.sin(angle);
      const corners = [
        [-interiorHalf, -interiorHalf], [interiorHalf, -interiorHalf],
        [interiorHalf, interiorHalf], [-interiorHalf, interiorHalf],
      ];
      let lowerEdge = 0; let lowerY = -Infinity;
      for (let i = 0; i < 4; i++) {
        const a = corners[i]; const b = corners[(i + 1) % 4];
        const averageScreenY = -((s * a[0] + c * a[1]) + (s * b[0] + c * b[1])) * 0.5;
        if (averageScreenY > lowerY) { lowerY = averageScreenY; lowerEdge = i; }
      }
      const a = corners[lowerEdge]; const b = corners[(lowerEdge + 1) % 4];
      const t = 0.15 + Math.random() * 0.7;
      const qx = a[0] + (b[0] - a[0]) * t; const qy = a[1] + (b[1] - a[1]) * t;
      return { x: dab.x + c * qx - s * qy, y: dab.y - (s * qx + c * qy) };
    }

    if (stroke.shape === 'split-chisel') {
      const halfHeight = Math.max(0, size * 0.31 - inset);
      if (halfHeight <= 0) return null;
      const segments = [[-size * 0.9 + inset, -size * 0.36 - inset], [-size * 0.18 + inset, size * 0.9 - inset]];
      const segment = segments[Math.random() < 1 / 3 ? 0 : 1];
      if (segment[1] <= segment[0]) return null;
      const corners = [
        [segment[0], -halfHeight], [segment[1], -halfHeight],
        [segment[1], halfHeight], [segment[0], halfHeight],
      ];
      let lowerEdge = 0; let lowerScreenY = -Infinity;
      for (let i = 0; i < 4; i++) {
        const a = corners[i]; const b = corners[(i + 1) % 4];
        const averageScreenY = -((s * a[0] + c * a[1]) + (s * b[0] + c * b[1])) * 0.5;
        if (averageScreenY > lowerScreenY) { lowerScreenY = averageScreenY; lowerEdge = i; }
      }
      const a = corners[lowerEdge]; const b = corners[(lowerEdge + 1) % 4];
      const t = 0.15 + Math.random() * 0.7;
      const qx = a[0] + (b[0] - a[0]) * t; const qy = a[1] + (b[1] - a[1]) * t;
      return { x: dab.x + c * qx - s * qy, y: dab.y - (s * qx + c * qy) };
    }

    const majorRadius = Math.max(0, size * 0.9 - inset);
    const minorRadius = Math.max(0, size * 0.35 - inset);
    if (majorRadius <= 0 || minorRadius <= 0) return null;
    for (let attempt = 0; attempt < 32; attempt++) {
      const contourAngle = Math.random() * Math.PI * 2;
      const qx = (majorRadius / pointSize) * Math.cos(contourAngle);
      const qy = (minorRadius / pointSize) * Math.sin(contourAngle);
      const px = c * qx - s * qy;
      const py = s * qx + c * qy;
      if (py < 0) return { x: dab.x + px * pointSize, y: dab.y - py * pointSize };
    }
    return null;
  }

  /** Matches the same logical-space primitive and rotation used by the dab shader. */
  private pointInsideDab(dab: Dab, stroke: Stroke, x: number, y: number): boolean {
    const size = dab.size;
    if (stroke.shape === 'round') {
      const dx = x - dab.x; const dy = y - dab.y;
      return dx * dx + dy * dy <= size * size * 0.25;
    }
    const angle = dab.angle ?? stroke.rotation;
    const c = Math.cos(angle); const s = Math.sin(angle);
    const pointSize = stroke.shape === 'square' ? size * (Math.abs(c) + Math.abs(s)) + 2 : size * 1.8;
    const px = (x - dab.x) / pointSize;
    const py = (dab.y - y) / pointSize;
    const qx = c * px + s * py;
    const qy = -s * px + c * py;
    if (stroke.shape === 'square') return Math.abs(qx * pointSize) <= size * 0.5 && Math.abs(qy * pointSize) <= size * 0.5;
    if (stroke.shape === 'split-chisel') {
      const localX = qx * pointSize;
      const localY = qy * pointSize;
      const inShortSegment = localX >= -size * 0.9 && localX <= -size * 0.36;
      const inLongSegment = localX >= -size * 0.18 && localX <= size * 0.9;
      return Math.abs(localY) <= size * 0.31 && (inShortSegment || inLongSegment);
    }
    return qx * qx / 0.25 + qy * qy / 0.0378 <= 1;
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
      for (const particle of stroke.splatter ?? []) {
        if (particle.age < particle.lifetime) {
          particle.age = Math.min(particle.lifetime, particle.age + dt);
          particle.x = particle.originX + particle.vx * particle.age;
          particle.y = particle.originY + particle.vy * particle.age + 0.5 * particle.gravity * particle.age * particle.age;
          if (particle.age >= particle.lifetime && particle.secondaryRunoff) {
            particle.secondaryRunoff.x = particle.x;
            particle.secondaryRunoff.y = particle.y;
            particle.secondaryRunoff.started = true;
          }
          changed = true;
        } else if (particle.secondaryRunoff?.started && particle.secondaryRunoff.length < particle.secondaryRunoff.maxLength) {
          const channel = particle.secondaryRunoff;
          channel.age += dt;
          const modulation = 0.9 + 0.1 * Math.sin(channel.age * 3 + channel.seed);
          channel.length = Math.min(channel.maxLength, channel.length + channel.speed * modulation * dt);
          changed = true;
        }
      }
      if (changed) this.geometryCache.delete(stroke);
    }
  }

  hasGrowingRuns(): boolean {
    for (const [stroke, runs] of this.byStroke) {
      if (runs.some((run) => run.channels.some((channel) => channel.length < channel.maxLength))) return true;
      if ((stroke.splatter ?? []).some((particle) => particle.age < particle.lifetime || Boolean(particle.secondaryRunoff?.started && particle.secondaryRunoff.length < particle.secondaryRunoff.maxLength))) return true;
    }
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
    const color = this.parseColor(stroke.color);
    for (const particle of stroke.splatter ?? []) {
      this.appendSplatter(vertices, particle, color);
      if (particle.secondaryRunoff?.started) this.appendDrop(vertices, particle.secondaryRunoff, color);
    }
    const geometry = new Float32Array(vertices);
    this.geometryCache.set(stroke, geometry);
    return geometry;
  }

  private appendSplatter(vertices: number[], particle: SplatterParticle, color: [number, number, number]): void {
    const c = Math.cos(Math.atan2(particle.vy, particle.vx));
    const s = Math.sin(Math.atan2(particle.vy, particle.vx));
    const radiusX = particle.radius * particle.aspect;
    const radiusY = particle.radius / Math.max(1, particle.aspect * 0.72);
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const b = (i + 1) / count * Math.PI * 2;
      const point = (angle: number): number[] => {
        const lx = Math.cos(angle) * radiusX;
        const ly = Math.sin(angle) * radiusY;
        return [particle.x + c * lx - s * ly, particle.y + s * lx + c * ly];
      };
      this.triangle(vertices, [particle.x, particle.y], point(a), point(b), color);
    }
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
