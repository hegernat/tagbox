import './style.css';
import { BrushEngine } from './brush';
import { pointerPosition, CanvasRenderer } from './renderer';
import { CANVAS_HEIGHT, CANVAS_WIDTH, settings, type Stroke } from './settings';

const canvas = document.querySelector<HTMLCanvasElement>('#paint-canvas')!;
const runoffCanvas = document.querySelector<HTMLCanvasElement>('#runoff-canvas')!;
const renderer = new CanvasRenderer(canvas, runoffCanvas);
document.querySelector<HTMLElement>('#brand-version')!.textContent = `v${__TAGBOX_VERSION__}`;
const strokes: Stroke[] = [];
const brush = new BrushEngine((stroke, dabs) => renderer.setActive(stroke, dabs));
const sizeInput = document.querySelector<HTMLInputElement>('#brush-size')!;
const smoothingInput = document.querySelector<HTMLInputElement>('#smoothing')!;
const wetnessInput = document.querySelector<HTMLInputElement>('#wetness')!;
const intensityInput = document.querySelector<HTMLInputElement>('#run-intensity')!;
const colorInput = document.querySelector<HTMLInputElement>('#brush-color')!;
const rotationInput = document.querySelector<HTMLInputElement>('#brush-rotation')!;
const rotationGroup = document.querySelector<HTMLElement>('#rotation-group')!;
const backgroundInput = document.querySelector<HTMLInputElement>('#canvas-background')!;
const presetPalette = document.querySelector<HTMLElement>('#preset-palette')!;
const materialPalette = document.querySelector<HTMLElement>('#material-palette')!;
const savedPalette = document.querySelector<HTMLElement>('#saved-palette')!;
const saveColorButton = document.querySelector<HTMLButtonElement>('#save-color-button')!;
const undoButton = document.querySelector<HTMLButtonElement>('#undo-button')!;
const appShell = document.querySelector<HTMLElement>('.app-shell')!;
const modeButton = document.querySelector<HTMLButtonElement>('#canvas-mode-button')!;
const exitCanvasButton = document.querySelector<HTMLButtonElement>('#canvas-exit-button')!;
const screenOrientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
const shapeRotations: Record<'square' | 'chisel', number> = { square: 0, chisel: 30 };
let isDrawing = false;
let holdTimer = 0;
let activePointerId: number | null = null;
function resizeCanvas(): void {
  const stage = canvas.parentElement!;
  const scale = Math.min(stage.clientWidth / CANVAS_WIDTH, stage.clientHeight / CANVAS_HEIGHT);
  const displayWidth = CANVAS_WIDTH * scale;
  const displayHeight = CANVAS_HEIGHT * scale;
  renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT, Math.min(window.devicePixelRatio || 1, 2), displayWidth, displayHeight);
}
new ResizeObserver(resizeCanvas).observe(canvas.parentElement!);
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
resizeCanvas();

canvas.addEventListener('pointerdown', (event) => {
  if (isDrawing || event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  isDrawing = true;
  activePointerId = event.pointerId;
  brush.begin(pointerPosition(event, canvas, CANVAS_WIDTH, CANVAS_HEIGHT), event.timeStamp, settings.size, settings.color, settings.smoothing, settings.wetness, settings.shape, settings.material, settings.rotationDegrees);
  holdTimer = window.setInterval(() => { if (isDrawing) brush.hold(); }, 60);
});
canvas.addEventListener('pointermove', (event) => {
  if (!isDrawing || event.pointerId !== activePointerId) return;
  const coalesced = [...(event.getCoalescedEvents?.() ?? [event])].sort((a, b) => a.timeStamp - b.timeStamp);
  for (const sample of coalesced) brush.move(pointerPosition(sample, canvas, CANVAS_WIDTH, CANVAS_HEIGHT), sample.timeStamp);
});
function finishStroke(event?: PointerEvent): void {
  if (!isDrawing) return;
  if (event && event.pointerId !== activePointerId) return;
  if (event?.type === 'pointerup') brush.move(pointerPosition(event, canvas, CANVAS_WIDTH, CANVAS_HEIGHT), event.timeStamp);
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
  if (document.fullscreenElement && screenOrientation.lock) {
    try { await screenOrientation.lock('landscape'); } catch { /* Orientation locking is optional and browser-controlled. */ }
  }
  resizeCanvas();
}
async function exitCanvasOnly(): Promise<void> {
  appShell.classList.remove('canvas-only');
  modeButton.textContent = 'Canvas Only';
  if (typeof screenOrientation.unlock === 'function') {
    try { screenOrientation.unlock(); } catch { /* Continue exiting Canvas Only if unlocking is unavailable. */ }
  }
  if (document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen(); } catch { /* Keep the Studio controls available. */ }
  }
  resizeCanvas();
}
modeButton.addEventListener('click', () => appShell.classList.contains('canvas-only') ? void exitCanvasOnly() : void enterCanvasOnly());
exitCanvasButton.addEventListener('click', () => void exitCanvasOnly());
document.addEventListener('fullscreenchange', () => {
  resizeCanvas();
  if (!document.fullscreenElement && appShell.classList.contains('canvas-only')) {
    if (typeof screenOrientation.unlock === 'function') {
      try { screenOrientation.unlock(); } catch { /* Keep fullscreen transitions independent of orientation support. */ }
    }
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
const presetColors = [
  '#ffffff', '#d9ff00', '#ff4d29', '#a77bff', '#32d6c3', '#111111', '#72777b', '#c7c9c5',
  '#ff6b6b', '#ff9f1c', '#ffd166', '#06d6a0', '#118ab2', '#4361ee', '#f72585', '#8d5a3b',
];
const brushColorKey = 'tagbox.brush-color';
const brushMaterialKey = 'tagbox.brush-material';
const savedColorsKey = 'tagbox.saved-colors';
const backgroundColorKey = 'tagbox.canvas-background';
const validColor = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);
function readSavedColors(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(savedColorsKey) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((color): color is string => typeof color === 'string' && validColor(color)).map((color) => color.toLowerCase()))] : [];
  } catch { return []; }
}
let savedColors = readSavedColors();
function setColor(color: string, selectPaint = true): void {
  if (!validColor(color)) return;
  color = color.toLowerCase();
  settings.color = color;
  if (selectPaint) {
    settings.material = 'paint';
    try { localStorage.setItem(brushMaterialKey, 'paint'); } catch { /* Drawing remains available when storage is disabled. */ }
  }
  colorInput.value = color;
  document.querySelector('#color-value')!.textContent = color.toUpperCase();
  document.querySelector<HTMLElement>('#color-swatch')!.style.backgroundColor = color;
  try { localStorage.setItem(brushColorKey, color); } catch { /* Drawing remains available when storage is disabled. */ }
  presetPalette.querySelectorAll<HTMLButtonElement>('.swatch').forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.color === color));
  savedPalette.querySelectorAll<HTMLButtonElement>('.swatch').forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.color === color));
  updateMaterialPalette();
}
function updateMaterialPalette(): void {
  materialPalette.querySelectorAll<HTMLButtonElement>('.material-swatch').forEach((button) => button.classList.toggle('active', button.dataset.material === settings.material));
}
function setMaterial(material: 'paint' | 'silver-chrome' | 'copper-chrome'): void {
  settings.material = material;
  try { localStorage.setItem(brushMaterialKey, material); } catch { /* Drawing remains available when storage is disabled. */ }
  updateMaterialPalette();
}
function addSwatch(container: HTMLElement, color: string, removable = false): void {
  const wrapper = document.createElement('span');
  wrapper.className = 'palette-item';
  const swatch = document.createElement('button');
  swatch.type = 'button'; swatch.className = 'swatch'; swatch.dataset.color = color;
  swatch.style.setProperty('--swatch', color); swatch.setAttribute('aria-label', `Select ${color}`); swatch.title = color;
  swatch.addEventListener('click', () => setColor(color));
  wrapper.append(swatch);
  if (removable) {
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-swatch'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${color} from saved colors`);
    remove.addEventListener('click', () => {
      savedColors = savedColors.filter((saved) => saved !== color);
      try { localStorage.setItem(savedColorsKey, JSON.stringify(savedColors)); } catch { /* Keep the in-memory palette usable. */ }
      renderPalettes();
    });
    wrapper.append(remove);
  }
  container.append(wrapper);
}
function renderPalettes(): void {
  presetPalette.replaceChildren(); savedPalette.replaceChildren();
  presetColors.forEach((color) => addSwatch(presetPalette, color));
  savedColors.forEach((color) => addSwatch(savedPalette, color, true));
  materialPalette.replaceChildren();
  for (const [material, label, style] of [['silver-chrome', 'Silver Chrome', 'silver'], ['copper-chrome', 'Copper Chrome', 'copper']] as const) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `material-swatch ${style}`; button.dataset.material = material; button.textContent = label;
    button.setAttribute('aria-label', `Select ${label}`); button.addEventListener('click', () => setMaterial(material));
    materialPalette.append(button);
  }
  setColor(settings.color, false);
}
try {
  const storedColor = localStorage.getItem(brushColorKey);
  if (storedColor && validColor(storedColor)) settings.color = storedColor.toLowerCase();
} catch { /* Use the default brush color when storage is unavailable. */ }
try {
  const storedMaterial = localStorage.getItem(brushMaterialKey);
  if (storedMaterial === 'silver-chrome' || storedMaterial === 'copper-chrome') settings.material = storedMaterial;
} catch { /* Use ordinary paint when storage is unavailable. */ }
renderPalettes();
colorInput.addEventListener('input', () => setColor(colorInput.value));
saveColorButton.addEventListener('click', () => {
  const color = settings.color.toLowerCase();
  if (savedColors.includes(color) || presetColors.includes(color)) return;
  savedColors.push(color);
  try { localStorage.setItem(savedColorsKey, JSON.stringify(savedColors)); } catch { /* Keep the in-memory palette usable. */ }
  renderPalettes();
});
function setBackgroundColor(color: string): void {
  if (!validColor(color)) return;
  color = color.toLowerCase();
  backgroundInput.value = color;
  document.querySelector<HTMLElement>('.background-color-swatch')!.style.backgroundColor = backgroundInput.value;
  renderer.setBackgroundColor(color);
  try { localStorage.setItem(backgroundColorKey, color); } catch { /* Keep background changes usable when storage is disabled. */ }
}
try {
  const storedBackground = localStorage.getItem(backgroundColorKey);
  setBackgroundColor(storedBackground && validColor(storedBackground) ? storedBackground : '#000000');
} catch { setBackgroundColor('#000000'); }
backgroundInput.addEventListener('input', () => setBackgroundColor(backgroundInput.value));
document.querySelectorAll<HTMLButtonElement>('.brush-shape-option').forEach((button) => button.addEventListener('click', () => {
  settings.shape = button.dataset.shape as typeof settings.shape;
  rotationGroup.hidden = settings.shape === 'round';
  if (settings.shape !== 'round') {
    settings.rotationDegrees = shapeRotations[settings.shape];
    rotationInput.value = String(settings.rotationDegrees);
    document.querySelector<HTMLOutputElement>('#rotation-value')!.textContent = `${settings.rotationDegrees}°`;
  }
  document.querySelectorAll<HTMLButtonElement>('.brush-shape-option').forEach((option) => {
    const selected = option === button;
    option.classList.toggle('active', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
}));
rotationInput.addEventListener('input', () => {
  settings.rotationDegrees = Number(rotationInput.value);
  if (settings.shape !== 'round') shapeRotations[settings.shape] = settings.rotationDegrees;
  document.querySelector<HTMLOutputElement>('#rotation-value')!.textContent = `${settings.rotationDegrees}°`;
});
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
