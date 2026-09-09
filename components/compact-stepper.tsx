'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CompactStepper({ id, label, value, min, max, step, onChange, prefix = '', description }: {
  id: string; label: ReactNode; value: number; min: number; max: number; step: number;
  onChange: (value: number) => void; prefix?: string; description: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const normalize = (text: string) => {
    const parsed = text.trim() === '' ? NaN : Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed)) return value;
    const bounded = Math.max(min, Math.min(max, parsed));
    return Number(Math.max(min, Math.min(max, min + Math.round((bounded - min) / step) * step)).toFixed(5));
  };
  const commit = (text: string) => { onChange(normalize(text)); setDraft(null); };
  const changeBy = (direction: number) => commit(String(normalize(draft ?? String(value)) + direction * step));

  return <div className="compact-stepper">
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <div className="compact-stepper-field">
      {prefix ? <span className="compact-stepper-prefix" aria-hidden="true">{prefix}</span> : null}
      <Input id={id} type="text" inputMode="decimal" role="spinbutton" autoComplete="off"
        aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}
        aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${prefix}${value}`}
        value={draft ?? String(Number(value.toFixed(2)))} onChange={event => setDraft(event.currentTarget.value)}
        onBlur={event => { if (draft !== null) commit(event.currentTarget.value); }}
        onKeyDown={event => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault(); changeBy(event.key === 'ArrowUp' ? 1 : -1);
          } else if (event.key === 'Enter') {
            event.preventDefault(); commit(event.currentTarget.value);
          } else if (event.key === 'Escape') {
            event.preventDefault(); setDraft(null);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault(); commit(String(event.key === 'Home' ? min : max));
          }
        }} />
      <div className="compact-stepper-arrows">
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Augmenter" aria-describedby={`${id}-label`}
          disabled={value >= max && draft === null} onPointerDown={event => event.preventDefault()} onClick={() => changeBy(1)}>
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Diminuer" aria-describedby={`${id}-label`}
          disabled={value <= min && draft === null} onPointerDown={event => event.preventDefault()} onClick={() => changeBy(-1)}>
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
    </div>
    <span id={`${id}-description`} className="sr-only">{description}</span>
  </div>;
}
