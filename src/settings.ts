export interface Point { x: number; y: number }
export type BrushShape = 'round' | 'square' | 'chisel';
export type Material = 'paint' | 'silver-chrome' | 'copper-chrome';
export interface BrushSettings { size: number; color: string; material: Material; smoothing: number; wetness: number; intensity: number }
export interface Dab extends Point { size: number; color: string; load: number; paintLoad: number; speed: number; angle: number }
export interface Stroke { points: Point[]; dabs: Dab[]; size: number; color: string; material: Material; shape: BrushShape; rotation: number }

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const settings: BrushSettings & { shape: BrushShape } = { size: 10, color: '#ffffff', material: 'paint', smoothing: 0.12, wetness: 0.68, intensity: 0.58, shape: 'round' };
