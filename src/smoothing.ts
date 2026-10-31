import type { Point } from './settings';

/** Low-pass filtering only: pointer jitter reduction, with no geometric resampling. */
export class PointerFilter {
  private filtered: Point | null = null;
  constructor(private readonly amount: number) {}

  push(raw: Point): Point {
    if (!this.filtered || this.amount <= 0) {
      this.filtered = { ...raw };
      return { ...raw };
    }
    // At 12% the pointer follows promptly with a small, visible stabilizing lag.
    // The 25% upper end produces a stronger but still bounded trail.
    const alpha = 1 - this.amount * 1.8;
    this.filtered = {
      x: this.filtered.x + (raw.x - this.filtered.x) * alpha,
      y: this.filtered.y + (raw.y - this.filtered.y) * alpha,
    };
    return { ...this.filtered };
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
    if (distance < 0.2) return [];
    this.previous = { ...point };
    this.lastSample = { ...point };
    return [{ ...point }];
  }
}
