export interface Point { x: number; y: number }
export type BrushShape = 'round' | 'square' | 'chisel' | 'split-chisel';
export type Material = 'paint' | 'silver-chrome' | 'copper-chrome' | 'gold-chrome';
export interface BrushSettings { size: number; color: string; material: Material; smoothing: number; wetness: number; intensity: number }
export interface Dab extends Point { size: number; color: string; load: number; paintLoad: number; speed: number; velocity: number; angle: number }
export interface SecondarySplatterRunoff extends Point { width: number; length: number; maxLength: number; speed: number; age: number; seed: number; started: boolean }
export interface SplatterParticle extends Point { originX: number; originY: number; vx: number; vy: number; radius: number; aspect: number; age: number; lifetime: number; gravity: number; secondaryRunoff?: SecondarySplatterRunoff }
export interface Stroke { points: Point[]; dabs: Dab[]; splatter?: SplatterParticle[]; splatterEnabled?: boolean; size: number; color: string; material: Material; shape: BrushShape; rotation: number }

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const settings: BrushSettings & { shape: BrushShape; rotationDegrees: number; splatterEnabled: boolean } = { size: 10, color: '#ffffff', material: 'paint', smoothing: 0.12, wetness: 0.68, intensity: 0.58, shape: 'round', rotationDegrees: 0, splatterEnabled: true };
