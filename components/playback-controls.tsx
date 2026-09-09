'use client';

import { type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { CompactStepper } from '@/components/compact-stepper';
import { Math as Formula } from '@/components/math';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { sliderValue } from '@/lib/quantum';
import { PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX } from '@/lib/playback';

export type DisplaySetting = {
  scale: number; onScaleChange: (value: number) => void; scaleMax?: number; scaleDescription?: string;
  displayControl?: never;
} | {
  displayControl: ReactNode;
  scale?: never; onScaleChange?: never; scaleMax?: never; scaleDescription?: never;
};

type DisplayProps = DisplaySetting & {
  id: string; stationary?: boolean;
  playbackSpeed?: number; onSpeedChange?: (value: number) => void;
  finalTime?: number; onFinalTimeChange?: (value: number) => void;
  finalMin?: number; finalMax?: number; finalStep?: number;
  finalSymbol?: string; finalDescription?: string;
};

export function DisplayControls({ id, stationary = false,
  playbackSpeed = 1, onSpeedChange, finalTime = 1, onFinalTimeChange,
  finalMin = .1, finalMax = 10, finalStep = .1, finalSymbol = '$t_f$',
  finalDescription = 'Fin de la fenêtre temporelle, sans modifier la vitesse de lecture.',
  ...setting
}: DisplayProps) {
  return <div className={`scattering-display-controls${stationary ? ' is-stationary' : ''}`} role="group" aria-label="Réglages de lecture et d’affichage">
    {!stationary && onSpeedChange ? <CompactStepper id={`${id}-playback-speed`} label="Vitesse de lecture" prefix="×"
      value={playbackSpeed} min={PLAYBACK_SPEED_MIN} max={PLAYBACK_SPEED_MAX} step={.25} onChange={onSpeedChange}
      description="Par défaut : ×1. De ×0.25 à ×4. Ne modifie pas l’évolution physique." /> : null}
    {setting.onScaleChange ? <CompactStepper id={`${id}-scale`} label={<>Facteur d’affichage <Formula>$s$</Formula></>}
      value={setting.scale} min={.5} max={setting.scaleMax ?? 20} step={.5} onChange={setting.onScaleChange}
      description={setting.scaleDescription ?? 'Le facteur s modifie uniquement l’affichage, pas l’état quantique ni les probabilités.'} /> : setting.displayControl}
    {!stationary && onFinalTimeChange ? <CompactStepper id={`${id}-final-time`} label={<>Temps final <Formula>{finalSymbol}</Formula></>}
      value={finalTime} min={finalMin} max={finalMax} step={finalStep} onChange={onFinalTimeChange} description={finalDescription} /> : null}
  </div>;
}

export type PlaybackClock = {
  time: number; setTime: Dispatch<SetStateAction<number>>;
  playing: boolean; setPlaying: Dispatch<SetStateAction<boolean>>;
  finalTime: number; setFinalTime: (value: number) => void;
  playbackSpeed: number; setPlaybackSpeed: (value: number) => void;
};

export function PlaybackControls({ id, clock,
  timeSymbol = '$t$', finalSymbol = '$t_f$', timeUnit = 1, finalMin = .1, finalMax = 20 * Math.PI,
  finalStep = .1, note, ...setting
}: { id: string; clock: PlaybackClock; timeSymbol?: string; timeUnit?: number; note?: ReactNode } & DisplaySetting &
  Pick<DisplayProps, 'finalSymbol' | 'finalMin' | 'finalMax' | 'finalStep'>) {
  const finished = clock.time >= clock.finalTime;
  return <div className="scattering-timeline">
    <div className="transport-controls">
      <Button onClick={() => { if (finished) clock.setTime(0); clock.setPlaying(value => !value); }}>
        {clock.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{clock.playing ? 'Pause' : finished ? 'Rejouer' : 'Animer'}
      </Button>
      <Button variant="outline" size="icon" aria-label="Revenir à l’état initial" onClick={() => { clock.setTime(0); clock.setPlaying(false); }}><RotateCcw aria-hidden="true" /></Button>
    </div>
    <div className="control-block">
      <div className="control-heading"><label htmlFor={`${id}-time`}>Temps <Formula>{timeSymbol}</Formula></label><output>{(clock.time / timeUnit).toFixed(2)}</output></div>
      <Slider id={`${id}-time`} min={0} max={clock.finalTime} step={.005} value={[clock.time]}
        aria-label="Temps de l’évolution" onValueChange={value => { clock.setTime(sliderValue(value, 0)); clock.setPlaying(false); }} />
      <div className="range-labels"><span>État initial</span><span>Temps final : {Number((clock.finalTime / timeUnit).toFixed(2))}</span></div>
    </div>
    <DisplayControls id={id} {...setting}
      playbackSpeed={clock.playbackSpeed} onSpeedChange={clock.setPlaybackSpeed}
      finalTime={clock.finalTime / timeUnit} onFinalTimeChange={value => clock.setFinalTime(value * timeUnit)}
      finalMin={Math.max(finalStep, finalMin / timeUnit)} finalMax={finalMax / timeUnit} finalStep={finalStep} finalSymbol={finalSymbol} />
    {note ? <p className="scale-note playback-note">{note}</p> : null}
  </div>;
}
