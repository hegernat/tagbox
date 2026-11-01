import type { Point } from './settings';

/** Time-based, velocity-adaptive low-pass filtering with a stable exact zero setting. */
export class PointerFilter {
  private filtered: Point | null = null;
  private previousRaw: Point | null = null;
  private previousTime = 0;
  constructor(private readonly amount: number) {}

  push(raw: Point, time: number): Point {
    if (!this.filtered || this.amount <= 0) {
      this.filtered = { ...raw };
      this.previousRaw = { ...raw };
      this.previousTime = time;
      return { ...raw };
    }
    const dt = Math.max(1, time - this.previousTime) / 1000;
    const rawSpeed = this.previousRaw ? Math.hypot(raw.x - this.previousRaw.x, raw.y - this.previousRaw.y) / dt : 0;
    const smoothing = Math.max(0, Math.min(1, this.amount));
    const tau = (0.004 + 0.15 * smoothing * smoothing) / (1 + rawSpeed / 700);
    const alpha = 1 - Math.exp(-dt / tau);
    this.filtered = {
      x: this.filtered.x + (raw.x - this.filtered.x) * alpha,
      y: this.filtered.y + (raw.y - this.filtered.y) * alpha,
    };
    this.previousRaw = { ...raw };
    this.previousTime = time;
    return { ...this.filtered };
  }

  flush(endpoint: Point): Point {
    this.filtered = { ...endpoint };
    this.previousRaw = { ...endpoint };
    return { ...endpoint };
  }

  current(): Point | null { return this.filtered ? { ...this.filtered } : null; }
}

/** Uniform geometric sampling is independent of pointer filtering. */
export class StrokeInterpolator {
  private previous: Point | null = null;
  private lastSample: Point | null = null;
  private distanceCarry = 0;
  constructor(private readonly spacing: number) {}

  push(point: Point): Point[] {
    if (!this.previous) {
      this.previous = { ...point };
      this.lastSample = { ...point };
      return [{ ...point }];
    }
    const dx = point.x - this.previous.x;
    const dy = point.y - this.previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.0001) return [];
    const samples: Point[] = [];
    let travelled = this.spacing - this.distanceCarry;
    while (travelled <= distance) {
      const ratio = travelled / distance;
      const sample = { x: this.previous.x + dx * ratio, y: this.previous.y + dy * ratio };
      samples.push(sample);
      this.lastSample = sample;
      travelled += this.spacing;
    }
    this.distanceCarry = (this.distanceCarry + distance) % this.spacing;
    this.previous = { ...point };
    return samples;
  }

  finish(point: Point): Point[] {
    if (!this.previous || !this.lastSample) return [];
    const distance = Math.hypot(point.x - this.lastSample.x, point.y - this.lastSample.y);
    if (distance < 0.001) return [];
    this.previous = { ...point };
    this.lastSample = { ...point };
    return [{ ...point }];
  }
}
