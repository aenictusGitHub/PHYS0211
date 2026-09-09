'use client';

import { useState } from 'react';
import { Math as Formula } from '@/components/math';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Coefficient } from '@/lib/quantum';
import { customWellCoefficients, dotDecimalText, parseDecimalInput, WELL_CUSTOM_MODE_COUNT } from '@/lib/well-state';

export function WellStateEditor({ coefficients, onApply }: { coefficients: Coefficient[]; onApply: (next: Coefficient[]) => void }) {
  const [draft, setDraft] = useState(() => Array.from({ length: WELL_CUSTOM_MODE_COUNT }, (_, i) => {
    const c = coefficients.find(c => c.n === i + 1);
    return { n: i + 1, amplitude: c ? String(Number(Math.hypot(c.re, c.im).toFixed(4))) : '0', phase: c ? String(Number((Math.atan2(c.im, c.re) * 180 / Math.PI).toFixed(1))) : '0' };
  }));
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const update = (index: number, key: 'amplitude' | 'phase', value: string) => {
    setDraft(current => current.map((entry, i) => i === index ? { ...entry, [key]: dotDecimalText(value) } : entry));
    setDirty(true); setError('');
  };
  return <form className="well-state-editor" onSubmit={event => {
    event.preventDefault();
    try {
      const next = customWellCoefficients(draft.map(entry => ({ n: entry.n, amplitude: parseDecimalInput(entry.amplitude), phase: parseDecimalInput(entry.phase) })));
      onApply(next); setDirty(false); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'État initial non valide.'); }
  }} noValidate>
    <p className="scale-note">Une amplitude nulle retire le mode. Les amplitudes relatives sont normalisées à l’application ; les phases contrôlent les interférences.</p>
    <table><caption className="sr-only">Amplitudes et phases des dix premiers états propres</caption><thead><tr><th scope="col"><Formula>{'$n$'}</Formula></th><th scope="col">Amplitude <Formula>{'$A_n$'}</Formula></th><th scope="col">Phase <Formula>{String.raw`$\theta_n\;(^{\circ})$`}</Formula></th></tr></thead>
      <tbody>{draft.map((entry, i) => <tr key={entry.n}><th scope="row"><Formula>{`$${entry.n}$`}</Formula></th><td><Input type="text" inputMode="decimal" lang="en" value={entry.amplitude} onChange={event => update(i, 'amplitude', event.target.value)} aria-label={`Amplitude relative du mode ${entry.n}, entre 0 et 1`} /></td><td><Input type="text" inputMode="decimal" lang="en" value={entry.phase} onChange={event => update(i, 'phase', event.target.value)} aria-label={`Phase du mode ${entry.n}, de -180 à 180 degrés`} /></td></tr>)}</tbody>
    </table>
    {error ? <p className="well-state-error" role="alert">{error}</p> : null}
    <Button type="submit" className="well-state-apply">Appliquer l’état initial</Button>
    <p className="scale-note" role="status">{dirty ? 'Modifications en attente : appliquez-les pour mettre à jour la courbe.' : <>État appliqué et normalisé : <Formula>{String.raw`$\sum_n|c_n|^2=1$`}</Formula>.</>}</p>
  </form>;
}
