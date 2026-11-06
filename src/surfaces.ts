import { CANVAS_HEIGHT, CANVAS_WIDTH } from './settings';
import type { RunoffObstacle } from './runoff';

export type CanvasSurface = 'solid' | 'concrete' | 'steel-gate';

const concretePhoto = new Image();
const gatePhoto = new Image();
const gateDetailsPhoto = new Image();
let gatePlate: HTMLCanvasElement | null = null;
let gateForegroundPlate: HTMLCanvasElement | null = null;
let concreteReady = false;
let gateReady = false;
let gateDetailsReady = false;
concretePhoto.onload = () => { concreteReady = true; window.dispatchEvent(new Event('tagbox-surface-assets-ready')); };
gatePhoto.onload = () => {
  gateReady = true;
  gatePlate = buildGatePlate();
  if (gateDetailsReady) gateForegroundPlate = buildGateForegroundPlate();
  window.dispatchEvent(new Event('tagbox-surface-assets-ready'));
};
gateDetailsPhoto.onload = () => {
  gateDetailsReady = true;
  if (gateReady) gateForegroundPlate = buildGateForegroundPlate();
  window.dispatchEvent(new Event('tagbox-surface-assets-ready'));
};
concretePhoto.src = '/concrete-photo-background.png';
gatePhoto.src = '/steel-gate-photo-background.png';
gateDetailsPhoto.src = '/steel-gate-photo-details.png';

const concreteJoint = { top: 585, bottom: 594 };
const gatePhysicalRects = [
  { left: 108, top: 12, right: 1561, bottom: 45 },       // top rail
  { left: 108, top: 893, right: 1561, bottom: 925 },     // lower rail / threshold
  { left: 108, top: 35, right: 146, bottom: 906 },       // left jamb
  { left: 1525, top: 35, right: 1561, bottom: 906 },     // right jamb
  { left: 830, top: 35, right: 843, bottom: 906 },       // center opening
  { left: 752, top: 488, right: 819, bottom: 531 },      // left handle and shadow
  { left: 850, top: 488, right: 920, bottom: 531 },      // right handle and shadow
] as const;
const gateObstacleRects = [gatePhysicalRects[0], gatePhysicalRects[1]] as const;

function coverTransform(image: HTMLImageElement): { scale: number; x: number; y: number } {
  const scale = Math.max(CANVAS_WIDTH / image.naturalWidth, CANVAS_HEIGHT / image.naturalHeight);
  return { scale, x: (CANVAS_WIDTH - image.naturalWidth * scale) / 2, y: (CANVAS_HEIGHT - image.naturalHeight * scale) / 2 };
}

function gateTransform(image: HTMLImageElement): { scale: number; x: number; y: number } {
  const scale = CANVAS_HEIGHT / image.naturalHeight;
  return { scale, x: (CANVAS_WIDTH - image.naturalWidth * scale) / 2, y: 0 };
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement): void {
  const transform = coverTransform(image);
  ctx.drawImage(image, transform.x, transform.y, image.naturalWidth * transform.scale, image.naturalHeight * transform.scale);
}

function drawGatePhoto(ctx: CanvasRenderingContext2D): void {
  if (!gateReady || !gatePlate) { drawConcretePhoto(ctx); return; }
  drawConcretePhoto(ctx);
  ctx.drawImage(gatePlate, 0, 0);
}

function drawConcretePhoto(ctx: CanvasRenderingContext2D): void {
  if (concreteReady) drawCover(ctx, concretePhoto);
  else { ctx.fillStyle = '#343638'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); }
}

function buildGatePlate(): HTMLCanvasElement {
  const plate = document.createElement('canvas'); plate.width = CANVAS_WIDTH; plate.height = CANVAS_HEIGHT;
  const ctx = plate.getContext('2d')!;
  const transform = gateTransform(gatePhoto);
  ctx.drawImage(gatePhoto, transform.x, 0, gatePhoto.naturalWidth * transform.scale, CANVAS_HEIGHT);
  // Fade only the source image's outer concrete margins into the matching concrete photo.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  const fade = 34;
  mask.addColorStop(0, 'rgba(255,255,255,0)');
  mask.addColorStop(Math.max(0, transform.x - 1) / CANVAS_WIDTH, 'rgba(255,255,255,0)');
  mask.addColorStop(Math.min(1, (transform.x + fade) / CANVAS_WIDTH), '#fff');
  mask.addColorStop(Math.min(1, (transform.x + gatePhoto.naturalWidth * transform.scale - fade) / CANVAS_WIDTH), '#fff');
  mask.addColorStop(Math.min(1, (transform.x + gatePhoto.naturalWidth * transform.scale + 1) / CANVAS_WIDTH), 'rgba(255,255,255,0)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return plate;
}

function buildGateForegroundPlate(): HTMLCanvasElement {
  const foreground = document.createElement('canvas');
  foreground.width = gateDetailsPhoto.naturalWidth;
  foreground.height = gateDetailsPhoto.naturalHeight;
  const foregroundContext = foreground.getContext('2d', { willReadFrequently: true })!;
  foregroundContext.drawImage(gateDetailsPhoto, 0, 0);
  const detailPixels = foregroundContext.getImageData(0, 0, foreground.width, foreground.height);

  const base = document.createElement('canvas');
  base.width = gatePhoto.naturalWidth;
  base.height = gatePhoto.naturalHeight;
  const baseContext = base.getContext('2d', { willReadFrequently: true })!;
  baseContext.drawImage(gatePhoto, 0, 0);
  const basePixels = baseContext.getImageData(0, 0, base.width, base.height).data;

  for (let y = 0; y < foreground.height; y++) {
    for (let x = 0; x < foreground.width; x++) {
      const index = (y * foreground.width + x) * 4;
      const inPhysicalDetail = gatePhysicalRects.some((rect) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom);
      if (!inPhysicalDetail) {
        detailPixels.data[index + 3] = 0;
        continue;
      }
      const difference = Math.abs(detailPixels.data[index] - basePixels[index]) * 0.299
        + Math.abs(detailPixels.data[index + 1] - basePixels[index + 1]) * 0.587
        + Math.abs(detailPixels.data[index + 2] - basePixels[index + 2]) * 0.114;
      detailPixels.data[index + 3] = Math.round(Math.max(0, Math.min(1, (difference - 16) / 32)) * 255);
    }
  }
  foregroundContext.putImageData(detailPixels, 0, 0);
  return foreground;
}

export function drawSurface(ctx: CanvasRenderingContext2D, surface: CanvasSurface, solidColor: string): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (surface === 'solid') {
    ctx.fillStyle = solidColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else if (surface === 'concrete') {
    drawConcretePhoto(ctx);
  } else {
    drawGatePhoto(ctx);
  }
}

function drawPhotoPatch(ctx: CanvasRenderingContext2D, image: HTMLImageElement, rect: { left: number; top: number; right: number; bottom: number }, transform: { scale: number; x: number; y: number }): void {
  const sourceWidth = rect.right - rect.left;
  const sourceHeight = rect.bottom - rect.top;
  ctx.drawImage(image, rect.left, rect.top, sourceWidth, sourceHeight,
    transform.x + rect.left * transform.scale, transform.y + rect.top * transform.scale,
    sourceWidth * transform.scale, sourceHeight * transform.scale);
}

export function drawForeground(ctx: CanvasRenderingContext2D, surface: CanvasSurface): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (surface === 'concrete' && concreteReady) {
    const transform = coverTransform(concretePhoto);
    drawPhotoPatch(ctx, concretePhoto, { left: 0, top: concreteJoint.top, right: concretePhoto.naturalWidth, bottom: concreteJoint.bottom }, transform);
  } else if (surface === 'steel-gate' && gateForegroundPlate) {
    const transform = gateTransform(gateDetailsPhoto);
    ctx.drawImage(gateForegroundPlate, transform.x, 0, gateForegroundPlate.width * transform.scale, CANVAS_HEIGHT);
  }
}

function toCanvasRect(rect: { left: number; top: number; right: number; bottom: number }, transform: { scale: number; x: number; y: number }): RunoffObstacle {
  return {
    left: transform.x + rect.left * transform.scale,
    top: transform.y + rect.top * transform.scale,
    right: transform.x + rect.right * transform.scale,
    bottom: transform.y + rect.bottom * transform.scale,
  };
}

export function getSurfaceObstacles(surface: CanvasSurface): RunoffObstacle[] {
  if (surface === 'concrete' && concreteReady) {
    return [toCanvasRect({ left: 0, top: concreteJoint.top, right: concretePhoto.naturalWidth, bottom: concreteJoint.bottom }, coverTransform(concretePhoto))];
  }
  if (surface === 'steel-gate' && gateDetailsReady) {
    const transform = gateTransform(gateDetailsPhoto);
    return gateObstacleRects.map((rect) => toCanvasRect(rect, transform));
  }
  return [];
}
