import { computeAutomaticScatteringTimeline, computeScatteringTimeline, type ScatteringConfig } from './scattering';

self.onmessage = (event: MessageEvent<{ config: ScatteringConfig; finalTime?: number | null }>) => {
  try {
    const reportProgress = (progress: number) => {
      self.postMessage({ type: 'progress', progress });
    };
    const timeline = event.data.finalTime === undefined || event.data.finalTime === null
      ? computeAutomaticScatteringTimeline(event.data.config, reportProgress)
      : computeScatteringTimeline(event.data.config, reportProgress, event.data.finalTime);
    self.postMessage({ type: 'ready', timeline }, {
      transfer: [timeline.real.buffer, timeline.imaginary.buffer, timeline.probabilities.buffer],
    });
  } catch (error) {
    console.error('Wavepacket calculation failed', error);
    self.postMessage({ type: 'error' });
  }
};
