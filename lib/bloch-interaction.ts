import type { Vector3 } from './spin';

const c = Math.sqrt(3) / 2;
const right: Vector3 = [c, -.5, 0];
const up: Vector3 = [-.25, -c / 2, c];
const front: Vector3 = [c / 2, .75, .5];
const dot = (a: Vector3, b: Vector3) => a.reduce((sum, value, i) => sum + value * b[i], 0);

export function projectBloch(vector: Vector3) {
  return { x: 220 + 145 * dot(vector, right), y: 200 - 145 * dot(vector, up), depth: dot(vector, front) };
}

/** Lift a pointer to the chosen hemisphere; dragging outside the disk stays on its rim. */
export function dragBlochVector(initial: Vector3, dx: number, dy: number, radius = 1, flip = false): Vector3 {
  const point = projectBloch(initial);
  let x = (point.x - 220) / 145 + dx / (145 * radius);
  let y = -(point.y - 200) / 145 - dy / (145 * radius);
  const distance = Math.hypot(x, y);
  if (distance > 1) { x /= distance; y /= distance; }
  const sign = (point.depth < 0 ? -1 : 1) * (flip ? -1 : 1);
  const z = sign * Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return right.map((value, i) => value * x + up[i] * y + front[i] * z) as Vector3;
}

export function spinAngles(vector: Vector3) {
  const length = Math.hypot(...vector);
  return { theta: Math.acos(Math.max(-1, Math.min(1, vector[2] / length))) * 180 / Math.PI,
    phi: (Math.atan2(vector[1], vector[0]) * 180 / Math.PI + 360) % 360 };
}

export function turnBlochVector(vector: Vector3, key: string): Vector3 {
  if (key === ' ') return dragBlochVector(vector, 0, 0, 1, true);
  const angles = spinAngles(vector);
  const theta = Math.max(0, Math.min(180, angles.theta + (key === 'ArrowUp' ? -3 : key === 'ArrowDown' ? 3 : 0))) * Math.PI / 180;
  const phi = (angles.phi + (key === 'ArrowLeft' ? -3 : key === 'ArrowRight' ? 3 : 0)) * Math.PI / 180;
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}
