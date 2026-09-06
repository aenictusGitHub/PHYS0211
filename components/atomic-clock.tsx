'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Math as Formula } from '@/components/math';
import { sliderValue, TAU_MAX } from '@/lib/quantum';

export function useAtomicClock(active: boolean, enabled: boolean) {
  const [phase, setPhase] = useState(0), [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!active || !enabled || !playing) return;
    let handle = 0, previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) {
        const elapsed = Math.min(now - previous, 60) / 1000;
        setPhase(current => (current + elapsed * TAU_MAX / 12) % TAU_MAX);
      }
      previous = now; handle = requestAnimationFrame(animate);
    };
    handle = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(handle);
  }, [active, enabled, playing]);
  return { phase, setPhase, playing, setPlaying };
}

export function AtomicClock({ clock, period, id }: { clock: ReturnType<typeof useAtomicClock>; period: string; id: string }) {
  return <div className="scattering-timeline atomic-clock">
    <div className="transport-controls">
      <Button onClick={() => clock.setPlaying(current => !current)}>{clock.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{clock.playing ? 'Pause' : 'Animer'}</Button>
      <Button variant="outline" size="icon" aria-label="Revenir à l’état initial" onClick={() => { clock.setPhase(0); clock.setPlaying(false); }}><RotateCcw aria-hidden="true" /></Button>
    </div>
    <div className="control-block"><div className="control-heading"><label htmlFor={id}>Temps <Formula>{'$t/T$'}</Formula></label><output>{(clock.phase / TAU_MAX).toFixed(2)}</output></div>
      <Slider id={id} min={0} max={TAU_MAX} step={.005} value={[clock.phase]} onValueChange={value => { clock.setPlaying(false); clock.setPhase(sliderValue(value, 0)); }} aria-label="Temps en fraction de la période" />
      <div className="range-labels"><span>État initial</span><span>Une période</span></div>
    </div>
    <p className="scale-note"><Formula>{period}</Formula>. Une période est parcourue en 12 secondes à l’écran. La phase globale commune aux deux états est omise.</p>
    <details className="theory-notes"><summary>Évolution de la superposition</summary>
      <Formula display>{String.raw`$\begin{aligned}\psi(t)&=\frac{\phi_a+e^{-i\Delta E t/\hbar}\phi_b}{\sqrt2},\\\Delta E&=E_b-E_a,\qquad T=\frac{2\pi\hbar}{\Delta E}.\end{aligned}$`}</Formula>
      <p>Les populations restent constantes ; seule la phase relative varie. <a href="https://farside.ph.utexas.edu/teaching/qmech/Quantum/node43.html" target="_blank" rel="noreferrer">États stationnaires et superpositions · R. Fitzpatrick</a>.</p>
    </details>
  </div>;
}
