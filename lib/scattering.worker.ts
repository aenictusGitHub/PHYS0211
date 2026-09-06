import { computeScatteringTimeline, type ScatteringConfig } from './scattering';

self.onmessage = (event: MessageEvent<ScatteringConfig>) => {
  try {
    const timeline = computeScatteringTimeline(event.data, progress => {
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'ready', timeline }, {
      transfer: [timeline.real.buffer, timeline.imaginary.buffer, timeline.probabilities.buffer],
    });
  } catch (error) {
    console.error('Wavepacket calculation failed', error);
    self.postMessage({ type: 'error' });
  }
};
