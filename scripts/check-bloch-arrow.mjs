import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blochArrowMesh } from '../lib/bloch-arrow.ts';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
for (const vector of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [.4330127, .75, .5], [-.4330127, -.75, -.5], [.2, .3, .4]]) {
  const original = [...vector], length = Math.hypot(...vector), axis = vector.map(x => x / length);
  const mesh = blochArrowMesh(vector);
  assert.equal(mesh.length, 97, '32-sided cylinder, cone, shoulder and end cap');
  assert.deepEqual(vector, original);
  let tipCount = 0;
  for (const face of mesh) {
    assert.ok(Number.isFinite(face.light) && Math.abs(face.light) <= 1 + 1e-12);
    for (const point of face.points) {
      assert.ok(point.every(Number.isFinite));
      const along = dot(point, axis);
      assert.ok(along >= -1e-12 && along <= length + 1e-12, 'Arrow never extends past its physical tip');
      const radial = Math.hypot(...point.map((x, i) => x - along * axis[i]));
      assert.ok(radial <= .085 * length + 1e-12);
      if (point.every((x, i) => x === vector[i])) tipCount++;
    }
  }
  assert.equal(tipCount, 32, 'All cone faces meet at the actual Bloch vector');
}
assert.deepEqual(blochArrowMesh([0, 0, 0]), []);
assert.deepEqual(blochArrowMesh([NaN, 0, 0]), []);
const component = readFileSync(new URL('../components/bloch-sphere.tsx', import.meta.url), 'utf8');
assert.match(component, /data-bloch-arrow="3d"/);
assert.doesNotMatch(component, /<marker|markerEnd/);
assert.match(component, /sort\(\(a, b\) => a.depth - b.depth\)/);
console.log('Bloch arrow: solid geometry, finite lighting, exact tip, depth ordering and no flat marker pass.');
