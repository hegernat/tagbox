import './style.css';
import { BrushEngine } from './brush';
import { pointerPosition, CanvasRenderer } from './renderer';
import { CANVAS_HEIGHT, CANVAS_WIDTH, settings, type Material, type Stroke } from './settings';

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
const splatterInput = document.querySelector<HTMLInputElement>('#paint-splatter')!;
const colorInput = document.querySelector<HTMLInputElement>('#brush-color')!;
const rotationGroup = document.querySelector<HTMLElement>('#rotation-group')!;
const rotationDial = document.querySelector<HTMLButtonElement>('#rotation-dial')!;
const rotationTip = document.querySelector<HTMLElement>('.rotation-tip-preview')!;
const rotationValue = document.querySelector<HTMLOutputElement>('#rotation-value')!;
const brushCursor = document.querySelector<HTMLElement>('#brush-cursor-preview')!;
const brushCursorTip = document.querySelector<HTMLElement>('.brush-cursor-tip')!;
const backgroundInput = document.querySelector<HTMLInputElement>('#canvas-background')!;
const presetPalette = document.querySelector<HTMLElement>('#preset-palette')!;
const materialPalette = document.querySelector<HTMLElement>('#material-palette')!;
const savedPalette = document.querySelector<HTMLElement>('#saved-palette')!;
const saveColorButton = document.querySelector<HTMLButtonElement>('#save-color-button')!;
const undoButton = document.querySelector<HTMLButtonElement>('#undo-button')!;
const appShell = document.querySelector<HTMLElement>('.app-shell')!;
const modeButton = document.querySelector<HTMLButtonElement>('#canvas-mode-button')!;
const helpButton = document.querySelector<HTMLButtonElement>('#help-button')!;
const helpDialog = document.querySelector<HTMLDialogElement>('#help-dialog')!;
const helpCloseButton = document.querySelector<HTMLButtonElement>('#help-close')!;
const exitCanvasButton = document.querySelector<HTMLButtonElement>('#canvas-exit-button')!;
const screenOrientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
const shapeRotations: Record<'square' | 'chisel' | 'split-chisel', number> = { square: 0, chisel: 30, 'split-chisel': 30 };
let isDrawing = false;
let holdTimer = 0;
let activePointerId: number | null = null;
let lastCanvasPointer: PointerEvent | null = null;
let rotationPointerId: number | null = null;
let rotationLastPointerAngle: number | null = null;
const touchCandidates = new Map<number, PointerEvent>();
let touchCandidateCount = 0;
let touchCandidateCanceled = false;
const gestureMoveThreshold = 8;

function updateBrushCursor(event: PointerEvent): void {
  lastCanvasPointer = event;
  if (event.pointerType === 'touch') { brushCursor.hidden = true; return; }
  const stage = canvas.parentElement!;
  const stageRect = stage.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const scale = canvasRect.width / CANVAS_WIDTH;
  const size = settings.size * scale;
  brushCursor.style.left = `${event.clientX - stageRect.left - stage.clientLeft}px`;
  brushCursor.style.top = `${event.clientY - stageRect.top - stage.clientTop}px`;
  const isChisel = settings.shape === 'chisel' || settings.shape === 'split-chisel';
  brushCursorTip.style.width = `${size * (isChisel ? 1.8 : 1)}px`;
  brushCursorTip.style.height = `${size * (isChisel ? (settings.shape === 'split-chisel' ? 0.62 : 0.7) : 1)}px`;
  brushCursorTip.dataset.shape = settings.shape;
  brushCursorTip.dataset.material = settings.material;
  brushCursorTip.style.transform = `translate(-50%, -50%) rotate(${settings.shape === 'round' ? 0 : settings.rotationDegrees}deg)`;
  brushCursor.hidden = false;
}

function setRotation(degrees: number): void {
  settings.rotationDegrees = Math.max(0, Math.min(360, Math.round(degrees)));
  if (settings.shape !== 'round') shapeRotations[settings.shape] = settings.rotationDegrees;
  rotationValue.textContent = `${settings.rotationDegrees}°`;
  rotationDial.setAttribute('aria-valuenow', String(settings.rotationDegrees));
  rotationDial.setAttribute('aria-valuetext', `${settings.rotationDegrees} degrees`);
  rotationTip.style.transform = `translate(-50%, -50%) rotate(${settings.rotationDegrees}deg)`;
  if (lastCanvasPointer) updateBrushCursor(lastCanvasPointer);
}

function pointerRotationAngle(event: PointerEvent): number {
  const rect = rotationDial.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const aroundDial = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  return ((aroundDial % 360) + 360) % 360;
}
function setRotationFromPointer(event: PointerEvent): void {
  const angle = pointerRotationAngle(event);
  if (rotationLastPointerAngle === null) {
    setRotation(angle);
  } else {
    let delta = angle - rotationLastPointerAngle;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    setRotation(settings.rotationDegrees + delta);
  }
  rotationLastPointerAngle = angle;
}

function resizeCanvas(): void {
  const stage = canvas.parentElement!;
  const portraitMobile = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
  const scale = portraitMobile
    ? stage.clientHeight / CANVAS_HEIGHT
    : Math.min(stage.clientWidth / CANVAS_WIDTH, stage.clientHeight / CANVAS_HEIGHT);
  const displayWidth = CANVAS_WIDTH * scale;
  const displayHeight = CANVAS_HEIGHT * scale;
  renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT, Math.min(window.devicePixelRatio || 1, 2), displayWidth, displayHeight);
}
new ResizeObserver(resizeCanvas).observe(canvas.parentElement!);
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
resizeCanvas();

function startStroke(event: PointerEvent, initialEvent = event): void {
  if (isDrawing) return;
  isDrawing = true;
  activePointerId = event.pointerId;
  brush.begin(pointerPosition(initialEvent, canvas, CANVAS_WIDTH, CANVAS_HEIGHT), initialEvent.timeStamp, settings.size, settings.color, settings.smoothing, settings.wetness, settings.shape, settings.material, settings.rotationDegrees, settings.splatterEnabled);
  holdTimer = window.setInterval(() => { if (isDrawing) brush.hold(); }, 60);
}
function clearCanvas(): void {
  if (isDrawing) finishStroke();
  strokes.length = 0; renderer.clear(); undoButton.disabled = true;
}
canvas.addEventListener('pointerdown', (event) => {
  if (isDrawing || event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  if (event.pointerType === 'touch') {
    if (touchCandidateCanceled) return;
    touchCandidates.set(event.pointerId, event);
    touchCandidateCount = Math.max(touchCandidateCount, touchCandidates.size);
    return;
  }
  touchCandidates.clear(); touchCandidateCount = 0; touchCandidateCanceled = false;
  startStroke(event);
});
canvas.addEventListener('pointerenter', updateBrushCursor);
canvas.addEventListener('pointermove', (event) => {
  updateBrushCursor(event);
  const candidate = touchCandidates.get(event.pointerId);
  if (candidate && Math.hypot(event.clientX - candidate.clientX, event.clientY - candidate.clientY) > gestureMoveThreshold) {
    if (touchCandidates.size === 1 && touchCandidateCount === 1) {
      touchCandidates.clear(); touchCandidateCount = 0;
      startStroke(event, candidate);
    } else {
      touchCandidateCanceled = true;
    }
  }
  if (!isDrawing || event.pointerId !== activePointerId) return;
  const coalesced = [...(event.getCoalescedEvents?.() ?? [event])].sort((a, b) => a.timeStamp - b.timeStamp);
  for (const sample of coalesced) brush.move(pointerPosition(sample, canvas, CANVAS_WIDTH, CANVAS_HEIGHT), sample.timeStamp);
});
canvas.addEventListener('pointerleave', () => { if (!isDrawing) brushCursor.hidden = true; });
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
canvas.addEventListener('pointerup', (event) => {
  if (touchCandidates.has(event.pointerId)) {
    if (touchCandidateCount === 1) {
      const initial = touchCandidates.get(event.pointerId)!;
      startStroke(event, initial);
      finishStroke(event);
    }
    touchCandidates.delete(event.pointerId);
    if (!touchCandidates.size) {
      if (!touchCandidateCanceled && touchCandidateCount === 2) undo();
      else if (!touchCandidateCanceled && touchCandidateCount === 3) clearCanvas();
      touchCandidateCount = 0; touchCandidateCanceled = false;
    }
    return;
  }
  finishStroke(event);
});
canvas.addEventListener('pointercancel', (event) => {
  if (touchCandidates.has(event.pointerId)) {
    touchCandidates.delete(event.pointerId); touchCandidateCanceled = true;
    if (!touchCandidates.size) { touchCandidateCount = 0; touchCandidateCanceled = false; }
    return;
  }
  finishStroke(event);
});
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
helpButton.addEventListener('click', () => {
  helpDialog.showModal();
  helpCloseButton.focus();
});
helpCloseButton.addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', (event) => {
  if (event.target !== helpDialog) return;
  const rect = helpDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) helpDialog.close();
});
helpDialog.addEventListener('close', () => helpButton.focus());
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
const splatterEnabledKey = 'tagbox.paint-splatter';
try { settings.splatterEnabled = localStorage.getItem(splatterEnabledKey) !== 'false'; } catch { /* Keep splatter enabled when storage is unavailable. */ }
splatterInput.checked = settings.splatterEnabled;
splatterInput.addEventListener('change', () => {
  settings.splatterEnabled = splatterInput.checked;
  try { localStorage.setItem(splatterEnabledKey, String(settings.splatterEnabled)); } catch { /* New strokes still honor the in-memory setting. */ }
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
  updateSelection();
}
function updateSelection(): void {
  const selectingColor = settings.material === 'paint';
  presetPalette.querySelectorAll<HTMLButtonElement>('.swatch').forEach((swatch) => swatch.classList.toggle('active', selectingColor && swatch.dataset.color === settings.color));
  savedPalette.querySelectorAll<HTMLButtonElement>('.swatch').forEach((swatch) => swatch.classList.toggle('active', selectingColor && swatch.dataset.color === settings.color));
  materialPalette.querySelectorAll<HTMLButtonElement>('.material-swatch').forEach((button) => button.classList.toggle('active', !selectingColor && button.dataset.material === settings.material));
}
function setMaterial(material: Material): void {
  settings.material = material;
  try { localStorage.setItem(brushMaterialKey, material); } catch { /* Drawing remains available when storage is disabled. */ }
  updateSelection();
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
  for (const [material, label, style] of [['silver-chrome', 'Silver Chrome', 'silver'], ['copper-chrome', 'Copper Chrome', 'copper'], ['gold-chrome', 'Gold Chrome', 'gold']] as const) {
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
  if (storedMaterial === 'silver-chrome' || storedMaterial === 'copper-chrome' || storedMaterial === 'gold-chrome') settings.material = storedMaterial;
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
    rotationTip.dataset.shape = settings.shape;
    setRotation(shapeRotations[settings.shape]);
  }
  if (lastCanvasPointer) updateBrushCursor(lastCanvasPointer);
  document.querySelectorAll<HTMLButtonElement>('.brush-shape-option').forEach((option) => {
    const selected = option === button;
    option.classList.toggle('active', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
}));
rotationDial.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  rotationPointerId = event.pointerId;
  rotationLastPointerAngle = null;
  rotationDial.setPointerCapture(event.pointerId);
  setRotationFromPointer(event);
});
rotationDial.addEventListener('pointermove', (event) => {
  if (event.pointerId === rotationPointerId) setRotationFromPointer(event);
});
const stopRotation = (event: PointerEvent): void => { if (event.pointerId === rotationPointerId) { rotationPointerId = null; rotationLastPointerAngle = null; } };
rotationDial.addEventListener('pointerup', stopRotation);
rotationDial.addEventListener('pointercancel', stopRotation);
rotationDial.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 5 : 1;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); setRotation(settings.rotationDegrees + step); }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); setRotation(settings.rotationDegrees - step); }
  else if (event.key === 'Home') { event.preventDefault(); setRotation(0); }
  else if (event.key === 'End') { event.preventDefault(); setRotation(360); }
});
function undo(): void {
  if (!strokes.length) return;
  strokes.pop(); renderer.setStrokes(strokes); undoButton.disabled = strokes.length === 0;
}
undoButton.addEventListener('click', undo);
document.querySelector('#clear-button')!.addEventListener('click', clearCanvas);
document.addEventListener('keydown', (event) => {
  if (helpDialog.open) return;
  if (event.key === 'Escape' && appShell.classList.contains('canvas-only')) { void exitCanvasOnly(); return; }
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) return;
  event.preventDefault();
  if (!event.repeat) undo();
}, true);
