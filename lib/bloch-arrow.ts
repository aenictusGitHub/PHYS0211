import type { Vector3 } from './spin';

export type ArrowFace = { points: Vector3[]; light: number };
const dot = (a: Vector3, b: Vector3) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vector3): Vector3 => v.map(value => value / Math.hypot(...v)) as Vector3;

/** Cylinder and cone in the sphere's coordinates; the tip is the actual Bloch vector. */
export function blochArrowMesh(vector: Vector3, widthScale = 1, headFraction = .22): ArrowFace[] {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length < 1e-10) return [];
  const axis = unit(vector);
  const u = unit(cross(axis, Math.abs(axis[2]) < .9 ? [0, 0, 1] : [0, 1, 0]));
  const v = cross(axis, u);
  const segments = 32, neck = (1 - headFraction) * length, headRadius = .085 * length * widthScale, shaftRadius = .027 * length * widthScale;
  const ring = (distance: number, radius: number) => Array.from({ length: segments }, (_, i): Vector3 => {
    const angle = 2 * Math.PI * i / segments;
    return axis.map((value, j) => distance * value + radius * (Math.cos(angle) * u[j] + Math.sin(angle) * v[j])) as Vector3;
  });
  const base = ring(0, shaftRadius), shaft = ring(neck, shaftRadius), head = ring(neck, headRadius);
  const light = unit([-.4, -.6, 1]);
  const face = (points: Vector3[]): ArrowFace => {
    const a = points[1].map((value, i) => value - points[0][i]) as Vector3;
    const b = points[2].map((value, i) => value - points[0][i]) as Vector3;
    return { points, light: dot(unit(cross(a, b)), light) };
  };
  const faces: ArrowFace[] = [face([...base].reverse())];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    faces.push(face([base[i], base[j], shaft[j], shaft[i]]));
    faces.push(face([shaft[i], shaft[j], head[j], head[i]]));
    faces.push(face([head[i], head[j], vector]));
  }
  return faces;
}
