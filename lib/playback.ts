export const PLAYBACK_SPEED_MIN = 0.25;
export const PLAYBACK_SPEED_MAX = 4;
export const PLAYBACK_SPEED_DEFAULT = 1;
export const NORMAL_PLAYBACK_SECONDS = 16;
export const LAB_FINAL_TIME_MIN = .1;
export const LAB_FINAL_TIME_MAX = 20 * Math.PI;

export function parsePlaybackSettings(data: Record<string, unknown>, scaleMax = 20) {
  const bounds = { playbackSpeed: [PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX], finalTime: [LAB_FINAL_TIME_MIN, LAB_FINAL_TIME_MAX], scale: [.5, scaleMax] };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const value = data[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  }
  return { playbackSpeed: data.playbackSpeed as number | undefined, finalTime: data.finalTime as number | undefined, scale: data.scale as number | undefined };
}

/** Map wall-clock time to simulation time; never change solver parameters.
 * Limit long background-tab gaps and stop exactly at the physical endpoint.
 */
export function advancePlaybackTime(current: number, elapsedSeconds: number, duration: number, speed = PLAYBACK_SPEED_DEFAULT, referenceDuration = duration) {
  const elapsed = Math.max(0, Math.min(elapsedSeconds, .05));
  const rate = Math.max(PLAYBACK_SPEED_MIN, Math.min(speed, PLAYBACK_SPEED_MAX));
  return Math.max(0, Math.min(duration, current + elapsed * referenceDuration / NORMAL_PLAYBACK_SECONDS * rate));
}
