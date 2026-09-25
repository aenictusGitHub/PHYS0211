// Real and imaginary parts of a Gaussian wave packet, with its envelope.
// Decorative only: no time evolution or laboratory state is implied.
const samples = Array.from({ length: 401 }, (_, index) => {
  const x = index * 2;
  const envelope = 55 * Math.exp(-0.5 * ((x - 500) / 108) ** 2);
  const phase = (x - 500) * 2 * Math.PI / 64;
  return { x, envelope, phase };
});

function pathFor(value: (sample: typeof samples[number]) => number) {
  return samples.map((sample, index) =>
    `${index ? 'L' : 'M'}${sample.x},${(75 - value(sample)).toFixed(2)}`,
  ).join(' ');
}

export function QuantumBannerWaves() {
  return <svg className="brand-waves" viewBox="0 0 800 150" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d={pathFor(({ envelope, phase }) => envelope * Math.cos(phase))} />
      <path className="brand-wave-accent" d={pathFor(({ envelope, phase }) => envelope * Math.sin(phase))} />
      <g strokeDasharray="4 5" strokeWidth=".8" opacity=".7">
        <path d={pathFor(({ envelope }) => envelope)} />
        <path d={pathFor(({ envelope }) => -envelope)} />
      </g>
    </g>
  </svg>;
}
