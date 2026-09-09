import assert from 'node:assert/strict';
import { clipEnergyGuides, potentialEnergyDomain, revealFraction } from '../lib/plot-geometry.ts';
import { energyGuides } from '../lib/energy-display.ts';
import { solveLinearWell } from '../lib/well-linear.ts';
import { solveDoubleWell, DOUBLE_WELL_DEFAULT } from '../lib/double-well.ts';

const close = (a, b, label, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const ranges = lines => lines.map(line => line.xRange);
const guide = value => ({ value, label: '$E_1$', tone: 'teal', dashed: true, width: 2 });

for (const slope of [-20, -.1, 0, .1, 6, 20]) {
  const potential = [{ x: 0, y: -slope / 2 }, { x: 1, y: slope / 2 }];
  for (const mean of [-1.97, 0, 2.5, 90.5, 100]) {
    const [bottom, top] = potentialEnergyDomain(potential, [mean]);
    for (const energy of [0, ...potential.map(p => p.y), mean]) assert.ok(bottom < energy && energy < top, 'Mean energy and the whole potential stay within the energy axis');
    assert.ok(Number.isFinite(bottom) && Number.isFinite(top));
    if (mean >= Math.min(...potential.map(p => p.y))) {
      const lines = clipEnergyGuides([{ ...guide(mean), label: '$\\langle E\\rangle$' }], potential);
      if (lines.length) { close(lines[0].value, mean, 'Mean-energy guide retains the calculated value'); assert.equal(lines[0].labelOutside, true); }
    }
  }
}

assert.deepEqual(ranges(clipEnergyGuides([guide(1)], [{ x: 0, y: -3 }, { x: 1, y: 3 }])), [[0, 2 / 3]]);
close(clipEnergyGuides([guide(1)], [{ x: 0, y: 3 }, { x: 1, y: -3 }])[0].xRange[0], 1 / 3, 'Negative slope clips the left end');
assert.deepEqual(ranges(clipEnergyGuides([guide(4)], [{ x: 0, y: -3 }, { x: 1, y: 3 }])), [[0, 1]]);
assert.deepEqual(clipEnergyGuides([guide(-4)], [{ x: 0, y: -3 }, { x: 1, y: 3 }]), []);
assert.deepEqual(ranges(clipEnergyGuides([guide(1)], [{ x: 0, y: 0 }, { x: 1, y: 0 }])), [[0, 1]]);
assert.deepEqual(ranges(clipEnergyGuides([{ ...guide(4), xRange: [.2, .6] }], [{ x: 0, y: -3 }, { x: 1, y: 3 }])), [[.2, .6]]);
assert.deepEqual(clipEnergyGuides([guide(0)], [{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }]), [], 'A tangent alone must not become a dot');
assert.deepEqual(ranges(clipEnergyGuides([guide(0)], [{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }])), [[0, 1]], 'Plateau at the energy is retained');
assert.deepEqual(ranges(clipEnergyGuides([guide(1)], [{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 10 }])), [[0, 1]], 'Vertical hard walls do not produce extra segments');

for (const strength of [-20, -6, -.1, 0, .1, 6, 20]) {
  const spectrum = solveLinearWell(strength);
  const guides = energyGuides(spectrum.energies.slice(0, 8), 0, 1);
  const clipped = clipEnergyGuides(guides, [{ x: 0, y: -strength / 2 }, { x: 1, y: strength / 2 }]);
  assert.equal(clipped.length, 8);
  assert.equal(clipped.filter(line => line.label).length, 1);
  for (const line of clipped) {
    const [start, end] = line.xRange;
    assert.ok(start >= 0 && start < end && end <= 1);
    for (let j = 0; j <= 10; j++) assert.ok(strength * (start + (end - start) * j / 10 - .5) <= line.value + 1e-10, 'Every dash lies above the potential');
    for (const boundary of [start, end]) if (boundary > 0 && boundary < 1) close(strength * (boundary - .5), line.value, 'Exact linear turning point');
    assert.equal(line.labelOutside, true);
  }
}

const harmonic = Array.from({ length: 401 }, (_, j) => { const x = -4 + 8 * j / 400; return { x, y: x * x / 2 }; });
for (let n = 0; n <= 8; n++) {
  const energy = n + .5, [line] = clipEnergyGuides([guide(energy)], harmonic), turn = Math.min(4, Math.sqrt(2 * energy));
  close(line.xRange[0], -turn, 'Harmonic left turning point', .0001);
  close(line.xRange[1], turn, 'Harmonic right turning point', .0001);
}

const spectrum = solveDoubleWell(DOUBLE_WELL_DEFAULT);
const profile = Array.from(spectrum.x, (x, j) => ({ x, y: spectrum.potential[j] }));
const twoWells = clipEnergyGuides([guide(DOUBLE_WELL_DEFAULT.barrier / 2)], profile);
assert.equal(twoWells.length, 2, 'Forbidden middle barrier separates the dashes into two intervals');
assert.ok(twoWells[0].xRange[1] < 0 && twoWells[1].xRange[0] > 0);
assert.equal(twoWells.filter(line => line.label).length, 1, 'Only one annotation for a split level');
close(twoWells[0].xRange[0], -twoWells[1].xRange[1], 'Double-well outer symmetry');
close(twoWells[0].xRange[1], -twoWells[1].xRange[0], 'Double-well inner symmetry');
assert.equal(clipEnergyGuides([guide(DOUBLE_WELL_DEFAULT.barrier * 1.5)], profile).length, 1, 'Above the barrier the level is connected');

const domain = [0, 2 * Math.PI];
close(revealFraction(-1, domain), 0, 'Before playback');
close(revealFraction(0, domain), 0, 'Reset hides the thick line');
close(revealFraction(Math.PI, domain), .5, 'Half-time reveal');
close(revealFraction(2 * Math.PI, domain), 1, 'End reveals the full thick line');
close(revealFraction(100, domain), 1, 'No overflow after the end');
close(revealFraction(0, [0, 0]), 0, 'Degenerate window');
for (const fraction of [.1, .8, .3, 1, 0]) close(revealFraction(fraction * domain[1], domain), fraction, 'Forward/backward seeking and replay');
close(revealFraction(3, [2, 6]), .25, 'Nonzero time origin');
console.log('Plot geometry: hard walls, positive/negative tilt, turning points, double-well gaps, single outside labels and progressive time reveal pass.');
