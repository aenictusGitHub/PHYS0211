'use client';

import { Math as Formula } from '@/components/math';
import { Slider } from '@/components/ui/slider';
import { sliderValue } from '@/lib/quantum';

export function QuantumParameter({ id, label, symbol, value, min, max, step = 1, onChange }: {
  id: string; label: string; symbol: string; value: number; min: number; max: number;
  step?: number; onChange: (value: number) => void;
}) {
  return <div className="control-block">
    <div className="control-heading">
      <label htmlFor={id}>{label} <Formula>{symbol}</Formula></label>
      <output>{value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 })}</output>
    </div>
    {min < max ? <>
      <Slider id={id} min={min} max={max} step={step} value={[value]}
        onValueChange={next => onChange(sliderValue(next, value))} aria-label={label} />
      <div className="range-labels" aria-hidden="true"><span>{min.toLocaleString('en-US', { useGrouping: false })}</span><span>{max.toLocaleString('en-US', { useGrouping: false })}</span></div>
    </> : <p className="scale-note">Valeur fixée par les autres nombres quantiques.</p>}
  </div>;
}
