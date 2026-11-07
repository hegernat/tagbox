import { PointerFilter, StrokeInterpolator } from './smoothing';
import { clampBrushSize, type BrushShape, type Dab, type Material, type Point, type Stroke } from './settings';

const DEFAULT_CHISEL_ROTATION_DEGREES = 140;

export class BrushEngine {
  private active: Stroke | null = null;
  private filter: PointerFilter | null = null;
  private interpolator: StrokeInterpolator | null = null;
  private lastRaw: Point | null = null;
  private lastTime = 0;
  private lastFiltered: Point | null = null;
  private wetness = 0.68;
  private filteredSpeed = 0;

  constructor(private readonly onChange: (stroke: Stroke, newDabs: Dab[]) => void) {}

  begin(point: Point, time: number, size: number, color: string, smoothing: number, wetness: number, shape: BrushShape = 'round', material: Material = 'paint', rotationDegrees = shape === 'chisel' || shape === 'split-chisel' ? DEFAULT_CHISEL_ROTATION_DEGREES : 0, splatterEnabled = true): void {
    size = clampBrushSize(size);
    // Store orientation on the stroke so later rotation controls can override it
    // without tying the nib to pointer motion.
    const rotation = shape === 'round' ? 0 : ((rotationDegrees % 360) + 360) % 360 * Math.PI / 180;
    this.active = { points: [point], dabs: [], splatter: [], splatterEnabled, size, color, material, shape, rotation };
    this.filter = new PointerFilter(smoothing);
    this.interpolator = new StrokeInterpolator(Math.max(0.7, size * 0.12));
    this.lastRaw = { ...point };
    this.lastTime = time;
    this.filteredSpeed = 0;
    this.lastFiltered = this.filter.push(point, time);
    this.wetness = wetness;
    const initial = this.interpolator.push(this.lastFiltered);
    this.emit(initial, 0, 0);
  }

  move(point: Point, time: number): void {
    if (!this.active || !this.filter || !this.interpolator || !this.lastRaw) return;
    const filtered = this.filter.push(point, time);
    const elapsed = Math.max(1, time - this.lastTime);
    const dx = point.x - this.lastRaw.x;
    const dy = point.y - this.lastRaw.y;
    const speed = Math.hypot(dx, dy) / elapsed * 1000;
    this.filteredSpeed += (speed - this.filteredSpeed) * 0.22;
    const smoothedSpeed = this.lastFiltered ? Math.hypot(filtered.x - this.lastFiltered.x, filtered.y - this.lastFiltered.y) / elapsed * 1000 : 0;
    this.emit(this.interpolator.push(filtered), this.filteredSpeed, smoothedSpeed);
    this.lastRaw = { ...point };
    this.lastTime = time;
    this.lastFiltered = filtered;
  }

  /** Called while the pointer is held to keep loading paint into a stationary spot. */
  hold(): void {
    if (!this.active || !this.lastFiltered) return;
    this.filteredSpeed *= 0.72;
    this.emit([this.lastFiltered], this.filteredSpeed, 0);
  }

  end(): Stroke | null {
    if (!this.active || !this.interpolator || !this.filter) return null;
    const endpoint = this.lastRaw ?? this.lastFiltered ?? this.active.points.at(-1)!;
    const exactEndpoint = this.filter.flush(endpoint);
    const tail = [...this.interpolator.push(exactEndpoint), ...this.interpolator.finish(exactEndpoint)];
    this.emit(tail, 0, 0);
    const completed = this.active;
    this.active = null;
    this.filter = null;
    this.interpolator = null;
    this.lastFiltered = null;
    this.lastRaw = null;
    this.onChange(completed, []);
    return completed;
  }

  private emit(points: Point[], speed: number, smoothedSpeed: number): void {
    if (!this.active || points.length === 0) return;
    // Slower motion lays down a deeper, wetter deposit per unit of brush path.
    const normalizedSpeed = Math.max(0, Math.min(1, speed / 650));
    const load = this.wetness * Math.max(0.13, Math.min(1, 0.2 + 0.8 / (1 + normalizedSpeed * 2.5)));
    const dabs: Dab[] = points.map((point) => ({ ...point, size: this.active!.size, color: this.active!.color, load, paintLoad: this.wetness, speed: normalizedSpeed, velocity: smoothedSpeed, angle: this.active!.rotation }));
    this.active.points.push(...points);
    this.active.dabs.push(...dabs);
    this.onChange(this.active, dabs);
  }
}
