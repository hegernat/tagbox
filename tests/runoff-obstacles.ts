import { RunoffEngine, type RunoffObstacle } from '../src/runoff';
import { getSurfaceObstacles } from '../src/surfaces';
import type { Dab, Stroke } from '../src/settings';

const result = document.querySelector<HTMLElement>('#result')!;
const check = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); };

function makeStroke(y = 500): Stroke {
  const dabs: Dab[] = Array.from({ length: 141 }, (_, index) => ({
    x: 220 + index * 10, y, size: 50, color: '#ff4d29', load: 1, paintLoad: 1,
    speed: 0, velocity: 0, angle: 0,
  }));
  return { points: [{ x: 220, y }, { x: 1620, y }], dabs, size: 50, color: '#ff4d29', material: 'paint', shape: 'round', rotation: 0 };
}

function maxRunoffY(engine: RunoffEngine, stroke: Stroke, inside?: RunoffObstacle): number {
  let maxY = -Infinity;
  engine.forEachGeometry(stroke, (_component, geometry) => {
    for (let i = 0; i < geometry.length; i += 5) {
      const x = geometry[i], y = geometry[i + 1];
      if (!inside || (x >= inside.left && x <= inside.right)) maxY = Math.max(maxY, y);
    }
  });
  return maxY;
}

function sampleGeometry(engine: RunoffEngine, stroke: Stroke): number[] {
  let sample: number[] = [];
  engine.forEachGeometry(stroke, (_component, geometry) => { if (!sample.length && geometry.length) sample = [...geometry.slice(0, 20)]; });
  return sample;
}

function buildEngine(obstacles: RunoffObstacle[]): { engine: RunoffEngine; stroke: Stroke } {
  const engine = new RunoffEngine(); engine.setIntensity(1); engine.setObstacles(obstacles);
  const stroke = makeStroke(); engine.addDabs(stroke, stroke.dabs, 1000, 1920, 1080);
  return { engine, stroke };
}

try {
  await new Promise<void>((resolve) => {
    const poll = (): void => {
      if (getSurfaceObstacles('concrete').length && getSurfaceObstacles('steel-gate').length) resolve();
      else window.setTimeout(poll, 25);
    };
    poll();
  });

  const concrete = getSurfaceObstacles('concrete')[0];
  const steel = getSurfaceObstacles('steel-gate');
  check(Boolean(concrete) && steel.length === 2, 'Photographic surface assets did not provide their obstacle masks.');

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const blocked = buildEngine([concrete]);
    for (let i = 0; i < 120; i++) blocked.engine.advance(0.05);
    const blockedMaxY = maxRunoffY(blocked.engine, blocked.stroke);
    check(blockedMaxY > 500, 'Blocked runoff did not generate geometry.');
    check(blockedMaxY <= concrete.top + 0.05, `Runoff crossed the concrete joint: ${blockedMaxY} > ${concrete.top}; mask=${JSON.stringify(concrete)}; sample=${JSON.stringify(sampleGeometry(blocked.engine, blocked.stroke))}.`);

    const unblocked = buildEngine([]);
    for (let i = 0; i < 120; i++) unblocked.engine.advance(0.05);
    const unblockedMaxY = maxRunoffY(unblocked.engine, unblocked.stroke);
    check(unblockedMaxY > concrete.bottom + 20, 'Control runoff failed to continue below the joint position.');

    const dynamic = buildEngine([]);
    for (let i = 0; i < 50; i++) dynamic.engine.advance(0.05);
    check(maxRunoffY(dynamic.engine, dynamic.stroke) > concrete.top, 'Dynamic test did not cross the seam before applying its mask.');
    dynamic.engine.setObstacles([concrete]);
    check(maxRunoffY(dynamic.engine, dynamic.stroke) <= concrete.top + 0.05, 'Applying a surface mask did not clip existing runoff.');

    const threshold = steel.find((obstacle) => obstacle.top > 900)!;
    check(Boolean(threshold), 'Steel gate threshold mask was not found.');
    const gate = new RunoffEngine(); gate.setIntensity(1); gate.setObstacles([threshold]);
    const gateStroke = makeStroke(850);
    gate.addDabs(gateStroke, gateStroke.dabs, 1000, 1920, 1080);
    for (let i = 0; i < 120; i++) gate.advance(0.05);
    const gateMaxY = maxRunoffY(gate, gateStroke);
    check(gateMaxY > 850, 'Steel gate runoff did not generate geometry.');
    check(gateMaxY <= threshold.top + 0.05, `Runoff crossed the steel gate threshold: ${gateMaxY} > ${threshold.top}.`);
  } finally {
    Math.random = originalRandom;
  }

  result.dataset.state = 'passed';
  result.textContent = `PASS\nConcrete construction seam stops runoff at y=${concrete.top.toFixed(1)} px.\nUnblocked control continues below the seam.\nApplying a surface mask clips existing runoff.\nSteel gate threshold stops runoff at y=${steel.find((obstacle) => obstacle.top > 900)!.top.toFixed(1)} px.`;
} catch (error) {
  result.dataset.state = 'failed';
  result.textContent = `FAIL\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
  throw error;
}
