'use client';

import { useState } from 'react';
import { PlaybackControls, type DisplaySetting } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';
import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { TAU_MAX } from '@/lib/quantum';

export function useAtomicClock(active: boolean, enabled: boolean, command: ExperimentCommand | null = null) {
  const [phase, setPhase] = useState(0), [playing, setPlaying] = useState(false);
  const clock = useLabPlayback({ active, enabled, time: phase, setTime: setPhase, playing, setPlaying, defaultFinalTime: TAU_MAX, rate: TAU_MAX / 12, command });
  return { ...clock, phase, setPhase };
}

export function AtomicClock({ clock, period, id, ...setting }: {
  clock: ReturnType<typeof useAtomicClock>; period: string; id: string;
} & DisplaySetting) {
  return <div className="atomic-clock">
    <PlaybackControls id={id} clock={clock} {...setting}
      timeUnit={TAU_MAX} timeSymbol="$t/T$" finalSymbol="$t_f/T$"
      note={<><Formula>{period}</Formula>. À vitesse ×1, une période est parcourue en 12 secondes à l’écran. La phase globale commune aux deux états est omise.</>} />
    <details className="theory-notes"><summary>Évolution de la superposition</summary>
      <Formula display>{String.raw`$\begin{aligned}\psi(t)&=\frac{\phi_a+e^{-i\Delta E t/\hbar}\phi_b}{\sqrt2},\\\Delta E&=E_b-E_a,\qquad T=\frac{2\pi\hbar}{\Delta E}.\end{aligned}$`}</Formula>
      <p>Les populations restent constantes ; seule la phase relative varie.</p>
    </details>
  </div>;
}
