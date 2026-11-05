import { CanvasRenderer } from '../src/renderer';
import type { Dab, Material, Point, Stroke } from '../src/settings';

const width = 1920;
const height = 1080;
const brushSize = 50;

async function reportEnvironmentPixels(): Promise<void> {
  const image = new Image();
  image.src = '/chrome-environment.png';
  await image.decode();
  const sample = document.createElement('canvas');
  sample.width = 1672;
  sample.height = 941;
  const context = sample.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, sample.width, sample.height);
  const rows = [94, 235, 470, 705];
  const values = rows.map((y) => {
    const [r, g, b] = context.getImageData(836, y, 1, 1).data;
    return `y=${y}: #${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  });
  document.querySelector('#environment-values')!.textContent = `Environment PNG samples (sRGB bytes at x=836): ${values.join(' · ')}`;
}
void reportEnvironmentPixels();

function makeStroke(material: Material, start: Point, end: Point): Stroke {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.ceil(distance / (brushSize * 0.3));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const dabs: Dab[] = Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      size: brushSize,
      color: '#ffffff',
      load: 1,
      paintLoad: 1,
      speed: 0,
      velocity: 0,
      angle,
    };
  });
  return { points: [start, end], dabs, size: brushSize, color: '#ffffff', material, shape: 'round', rotation: 0 };
}

for (const material of ['silver-chrome', 'copper-chrome', 'gold-chrome'] as const) {
  const canvas = document.querySelector<HTMLCanvasElement>(`#${material.split('-')[0]}`)!;
  const runoffCanvas = document.querySelector<HTMLCanvasElement>(`#${material.split('-')[0]}-runoff`)!;
  const renderer = new CanvasRenderer(canvas, runoffCanvas);
  const stage = canvas.parentElement!;
  const resize = (): void => renderer.resize(width, height, 1, stage.clientWidth, stage.clientHeight);
  new ResizeObserver(resize).observe(stage);
  resize();
  renderer.setStrokes([
    makeStroke(material, { x: 260, y: 540 }, { x: 1660, y: 540 }),
    makeStroke(material, { x: 960, y: 210 }, { x: 960, y: 870 }),
    makeStroke(material, { x: 500, y: 830 }, { x: 1430, y: 300 }),
  ]);
}
