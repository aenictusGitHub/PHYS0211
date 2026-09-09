import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === './playback' ? './playback.ts' : specifier, context); } });
const { SG_CASCADE_DEFAULTS: base, SG_CASCADE_ARRIVAL, SG_CASCADE_PRESETS, sgCascadeStatistics: stats, sgCascadeAtoms: sample, sgCascadeCounts: counts, sgCascadeGlyph: glyph } = await import('../lib/stern-gerlach-cascade.ts');
const { parseSternGerlach: parse } = await import('../lib/stern-gerlach.ts');
const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const last = config => stats(config)[2];
near(stats(base)[0].passed, .5); near(stats(base)[1].passed, .25);
near(last(base).plus, .125); near(last(base).minus, .125);
const same = { ...base, angles: [0, 0, 0] };
near(last(same).plus, .5); near(last(same).minus, 0);
near(last({ ...base, middle: false }).plus, .5); near(last({ ...base, middle: false }).minus, 0);
near(last({ ...base, filters: ['plus', 'both'] }).plus, .25);
near(last({ ...base, filters: ['plus', 'both'] }).minus, .25);
near(last({ ...same, filters: ['plus', 'minus'] }).incoming, 0);
near(last({ ...same, beam: 'z-minus' }).incoming, 0);
near(last({ ...same, beam: 'z-plus' }).plus, 1);
near(last({ ...same, angles: [0, 0, 180], beam: 'z-plus' }).minus, 1);
for (const angle of [0, 10, 45, 90, 135, 180]) {
  const config = { ...base, angles: [0, angle, 0] };
  near(last(config).plus, .5 * Math.cos(angle * Math.PI / 360) ** 4);
  near(last(config).minus, .5 * Math.cos(angle * Math.PI / 360) ** 2 * Math.sin(angle * Math.PI / 360) ** 2);
}
for (const beam of ['mixed', 'z-plus', 'z-minus', 'x-plus', 'x-minus', 'y-plus', 'y-minus']) for (const a of ['plus', 'minus', 'both']) for (const b of ['plus', 'minus', 'both']) for (const middle of [true, false]) {
  const config = { ...base, beam, filters: [a, b], middle, angles: [25, 90, 165] };
  for (const stage of stats(config)) {
    near(stage.passed + stage.blocked, stage.incoming);
    if (!stage.bypassed) near(stage.plus + stage.minus, stage.incoming);
    assert.ok(stage.passed >= 0 && stage.passed <= 1 + 1e-12);
  }
}
const atoms = sample(base, 400, 7), tally = counts(atoms, base);
near(tally[0].passed / (tally[0].plus + tally[0].minus), .5, .025);
near(tally[1].passed / (tally[1].plus + tally[1].minus), .5, .03);
near(tally[2].plus / (tally[2].plus + tally[2].minus), .5, .04);
assert.deepEqual(sample(base, 12, 7), sample(base, 12, 7));
assert.notDeepEqual(sample(base, 12, 7), sample(base, 12, 8));
assert.equal(sample(base, SG_CASCADE_ARRIVAL - .001, 7).filter(a => a.detected).length, 0);
assert.deepEqual(counts(sample(base, .5, 7), base), Array.from({ length: 3 }, () => ({ plus: 0, minus: 0, passed: 0, blocked: 0 })));
for (const preset of SG_CASCADE_PRESETS) {
  const config = { ...base, ...preset };
  let previous = counts([], config);
  for (const time of [0, .7, 1, 1.3, 2, 2.6, 3, 3.3, 8, 12]) {
    const particles = sample(config, time, 9), current = counts(particles, config);
    current.forEach((row, i) => { for (const k of Object.keys(row)) assert.ok(row[k] >= previous[i][k]); });
    assert.ok(current[1].plus + current[1].minus <= current[0].passed);
    assert.ok(current[2].plus + current[2].minus <= current[1].passed);
    for (const particle of particles) {
      const g = glyph(particle, config);
      if (g) assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y) && g.x >= 32 && g.x <= 917 && g.y >= 84 && g.y <= 168);
      if (particle.stoppedAt !== null) assert.ok(particle.outcomes.slice(particle.stoppedAt + 1).every(v => v === null));
    }
    previous = current;
  }
}
assert.equal(glyph(sample(base, 0, 1)[0], base).spin, null);
assert.equal(parse({ lab: 'stern-gerlach', sgCascadeAngles: [0, 90, 0] }).sgSetup, 'cascade');
assert.equal(parse({ lab: 'stern-gerlach' }).sgSetup, 'single');
assert.equal(parse({ lab: 'stern-gerlach', sgSetup: 'cascade', sgCascadeMiddle: false, finalTime: 12 }).sgCascadeMiddle, false);
for (const extra of [{ sgSetup: 'other' }, { sgCascadeAngles: [0, 90] }, { sgCascadeAngles: [0, NaN, 0] }, { sgCascadeAngles: [0, 181, 0] }, { sgCascadeFilters: ['plus'] }, { sgCascadeFilters: ['plus', 'bad'] }, { sgCascadeMiddle: 1 }, { sgSetup: 'single', sgCascadeMiddle: false }, { sgSetup: 'cascade', sgJ: 1 }, { sgSetup: 'cascade', sgModel: 'classical' }, { sgSetup: 'cascade', sgGradient: 500 }, { sgSetup: 'cascade', finalTime: 2 }]) assert.throws(() => parse({ lab: 'stern-gerlach', ...extra }));
console.log('Stern–Gerlach cascade: conditional Born probabilities, filtering, bypass versus nonselective measurement, conservation, finite animation, reproducible counters and command bounds pass.');
