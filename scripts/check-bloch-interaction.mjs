import assert from 'node:assert/strict';
import { projectBloch, dragBlochVector, spinAngles, turnBlochVector } from '../lib/bloch-interaction.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
for (const initial of [[1, 0, 0], [0, -1, 0], [0, 0, -1], [.6, 0, .8]]) {
  dragBlochVector(initial, 0, 0).forEach((v, i) => near(v, initial[i]));
  const mirrored = dragBlochVector(initial, 0, 0, 1, true);
  near(projectBloch(mirrored).depth, -projectBloch(initial).depth);
  near(projectBloch(mirrored).x, projectBloch(initial).x);
  near(projectBloch(mirrored).y, projectBloch(initial).y);
  turnBlochVector(mirrored, ' ').forEach((v, i) => near(v, initial[i]));
  for (const radius of [1, 1.25]) for (const delta of [[10, -20], [-100, 30], [1000, -1000]]) {
    const vector = dragBlochVector(initial, ...delta, radius);
    near(Math.hypot(...vector), 1);
    const {theta, phi} = spinAngles(vector);
    near(Math.cos(theta * Math.PI / 180), vector[2]);
    near(Math.sin(theta * Math.PI / 180) * Math.cos(phi * Math.PI / 180), vector[0]);
    near(Math.sin(theta * Math.PI / 180) * Math.sin(phi * Math.PI / 180), vector[1]);
  }
}
const front = [Math.sqrt(3) / 4, .75, .5];
for (const radius of [1, 1.25]) {
  const initial = projectBloch(front.map(v => v * radius));
  const moved = projectBloch(dragBlochVector(front, 30, -20, radius).map(v => v * radius));
  near(moved.x - initial.x, 30);
  near(moved.y - initial.y, -20);
}
near(spinAngles(turnBlochVector([1, 0, 0], 'ArrowUp')).theta, 87);
near(spinAngles(turnBlochVector([1, 0, 0], 'ArrowRight')).phi, 3);
console.log('Bloch interaction: unit sphere, projection round-trip, both hemispheres, field radius, angles and keyboard pass.');
