import './style.css';
import { BrushEngine } from './brush';
import { pointerPosition, CanvasRenderer } from './renderer';
import { settings, type Stroke } from './settings';

const canvas = document.querySelector<HTMLCanvasElement>('#paint-canvas')!;
const runoffCanvas = document.querySelector<HTMLCanvasElement>('#runoff-canvas')!;
const renderer = new CanvasRenderer(canvas, runoffCanvas);
const strokes: Stroke[] = [];
const brush = new BrushEngine((stroke, dabs) => renderer.setActive(stroke, dabs));
const sizeInput = document.querySelector<HTMLInputElement>('#brush-size')!;
const smoothingInput = document.querySelector<HTMLInputElement>('#smoothing')!;
const wetnessInput = document.querySelector<HTMLInputElement>('#wetness')!;
const intensityInput = document.querySelector<HTMLInputElement>('#run-intensity')!;
const colorInput = document.querySelector<HTMLInputElement>('#brush-color')!;
const undoButton = document.querySelector<HTMLButtonElement>('#undo-button')!;
const appShell = document.querySelector<HTMLElement>('.app-shell')!;
const modeButton = document.querySelector<HTMLButtonElement>('#canvas-mode-button')!;
const exitCanvasButton = document.querySelector<HTMLButtonElement>('#canvas-exit-button')!;
let isDrawing = false;
let holdTimer = 0;
let activePointerId: number | null = null;
let canvasWidth = 1;
let canvasHeight = 1;

function resizeCanvas(): void {
  const stage = canvas.parentElement!;
  canvasWidth = stage.clientWidth;
  canvasHeight = stage.clientHeight;
  renderer.resize(canvasWidth, canvasHeight, Math.min(window.devicePixelRatio || 1, 2));
}
new ResizeObserver(resizeCanvas).observe(canvas.parentElement!);
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

canvas.addEventListener('pointerdown', (event) => {
  if (isDrawing || event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  isDrawing = true;
  activePointerId = event.pointerId;
  brush.begin(pointerPosition(event, canvas, canvasWidth, canvasHeight), event.timeStamp, settings.size, settings.color, settings.smoothing, settings.wetness, settings.shape);
  holdTimer = window.setInterval(() => { if (isDrawing) brush.hold(); }, 60);
});
canvas.addEventListener('pointermove', (event) => {
  if (!isDrawing || event.pointerId !== activePointerId) return;
  const coalesced = [...(event.getCoalescedEvents?.() ?? [event])].sort((a, b) => a.timeStamp - b.timeStamp);
  for (const sample of coalesced) brush.move(pointerPosition(sample, canvas, canvasWidth, canvasHeight), sample.timeStamp);
});
function finishStroke(event?: PointerEvent): void {
  if (!isDrawing) return;
  if (event && event.pointerId !== activePointerId) return;
  if (event?.type === 'pointerup') brush.move(pointerPosition(event, canvas, canvasWidth, canvasHeight), event.timeStamp);
  isDrawing = false;
  activePointerId = null;
  window.clearInterval(holdTimer);
  const stroke = brush.end();
  if (stroke) { strokes.push(stroke); renderer.commitStroke(stroke); undoButton.disabled = false; }
}
canvas.addEventListener('pointerup', (event) => finishStroke(event));
canvas.addEventListener('pointercancel', (event) => finishStroke(event));
canvas.addEventListener('lostpointercapture', () => finishStroke());

async function enterCanvasOnly(): Promise<void> {
  appShell.classList.add('canvas-only');
  modeButton.textContent = 'Studio';
  try { if (!document.fullscreenElement && appShell.requestFullscreen) await appShell.requestFullscreen(); } catch { /* CSS canvas-only mode remains available when fullscreen is denied. */ }
  resizeCanvas();
}
async function exitCanvasOnly(): Promise<void> {
  appShell.classList.remove('canvas-only');
  modeButton.textContent = 'Canvas Only';
  if (document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen(); } catch { /* Keep the Studio controls available. */ }
  }
  resizeCanvas();
}
modeButton.addEventListener('click', () => appShell.classList.contains('canvas-only') ? void exitCanvasOnly() : void enterCanvasOnly());
exitCanvasButton.addEventListener('click', () => void exitCanvasOnly());
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && appShell.classList.contains('canvas-only')) {
    appShell.classList.remove('canvas-only'); modeButton.textContent = 'Canvas Only'; resizeCanvas();
  }
});

sizeInput.addEventListener('input', () => {
  settings.size = Number(sizeInput.value);
  document.querySelector('#size-value')!.textContent = `${settings.size} px`;
});
smoothingInput.addEventListener('input', () => {
  settings.smoothing = Number(smoothingInput.value) / 100;
  document.querySelector('#smoothing-value')!.textContent = `${smoothingInput.value}%`;
});
wetnessInput.addEventListener('input', () => {
  settings.wetness = Number(wetnessInput.value) / 100;
  document.querySelector('#wetness-value')!.textContent = `${wetnessInput.value}%`;
});
intensityInput.addEventListener('input', () => {
  settings.intensity = Number(intensityInput.value) / 100;
  renderer.setRunIntensity(settings.intensity);
  document.querySelector('#run-intensity-value')!.textContent = `${intensityInput.value}%`;
});
function setColor(color: string): void {
  settings.color = color;
  colorInput.value = color;
  document.querySelector('#color-value')!.textContent = color.toUpperCase();
  document.querySelector<HTMLElement>('#color-swatch')!.style.backgroundColor = color;
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.color?.toLowerCase() === color.toLowerCase()));
}
colorInput.addEventListener('input', () => setColor(colorInput.value));
document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((swatch) => swatch.addEventListener('click', () => setColor(swatch.dataset.color!)));
document.querySelectorAll<HTMLButtonElement>('.brush-shape-option').forEach((button) => button.addEventListener('click', () => {
  settings.shape = button.dataset.shape as typeof settings.shape;
  document.querySelectorAll<HTMLButtonElement>('.brush-shape-option').forEach((option) => {
    const selected = option === button;
    option.classList.toggle('active', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
}));
function undo(): void {
  if (!strokes.length) return;
  strokes.pop(); renderer.setStrokes(strokes); undoButton.disabled = strokes.length === 0;
}
undoButton.addEventListener('click', undo);
document.querySelector('#clear-button')!.addEventListener('click', () => {
  if (isDrawing) finishStroke();
  strokes.length = 0; renderer.clear(); undoButton.disabled = true;
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && appShell.classList.contains('canvas-only')) { void exitCanvasOnly(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
});
