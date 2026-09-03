export type ExperimentCommand = {
  id: number;
  lab: 'well' | 'oscillator';
  mode?: 'stationary' | 'evolution';
  quantumNumber?: number;
  preset?: string;
  time?: number;
  scale?: number;
};
