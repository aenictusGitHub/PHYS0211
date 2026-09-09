'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type ExperimentCommand } from '@/components/lab-types';
import { advancePlaybackTime, LAB_FINAL_TIME_MIN, LAB_FINAL_TIME_MAX, PLAYBACK_SPEED_DEFAULT, PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX } from '@/lib/playback';

export function useLabPlayback({ active, enabled, time, setTime, playing, setPlaying, defaultFinalTime,
  rate, command,
}: {
  active: boolean; enabled: boolean; time: number; setTime: Dispatch<SetStateAction<number>>;
  playing: boolean; setPlaying: Dispatch<SetStateAction<boolean>>;
  defaultFinalTime: number; rate: number; command: ExperimentCommand | null;
}) {
  const [finalTime, setEndpoint] = useState(defaultFinalTime);
  const [playbackSpeed, setSpeed] = useState(PLAYBACK_SPEED_DEFAULT);
  const speed = useRef(playbackSpeed);
  useEffect(() => { speed.current = playbackSpeed; }, [playbackSpeed]);
  const setPlaybackSpeed = useCallback((value: number) => setSpeed(Math.max(PLAYBACK_SPEED_MIN, Math.min(PLAYBACK_SPEED_MAX, value))), []);
  const setFinalTime = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const end = Math.max(LAB_FINAL_TIME_MIN, Math.min(LAB_FINAL_TIME_MAX, value));
    setEndpoint(end); setTime(current => Math.min(current, end)); setPlaying(false);
  }, [setTime, setPlaying]);
  useEffect(() => {
    if (!command) return;
    if (command.playbackSpeed !== undefined) setPlaybackSpeed(command.playbackSpeed);
    if (command.finalTime !== undefined) setEndpoint(command.finalTime);
    else if (command.time !== undefined) setEndpoint(current => Math.max(current, command.time!));
  }, [command, setPlaybackSpeed]);
  useEffect(() => {
    if (time >= finalTime) { setTime(finalTime); setPlaying(false); }
  }, [time, finalTime, setTime, setPlaying]);
  useEffect(() => {
    if (!active || !enabled || !playing) return;
    let handle = 0, previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) setTime(current => advancePlaybackTime(current, (now - previous!) / 1000, finalTime, speed.current, rate * 16));
      previous = now; handle = window.requestAnimationFrame(animate);
    };
    handle = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(handle);
  }, [active, enabled, playing, finalTime, rate, setTime]);
  return { time, setTime, playing, setPlaying, finalTime, setFinalTime, playbackSpeed, setPlaybackSpeed };
}
