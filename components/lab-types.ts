export type ExperimentCommand = {
  id: number;
  lab: 'well' | 'oscillator' | 'scattering';
  mode?: 'stationary' | 'evolution';
  quantumNumber?: number;
  preset?: string;
  time?: number;
  scale?: number;
  potential?: 'barrier' | 'gaussian' | 'well';
  height?: number;
  width?: number;
  momentum?: number;
  sigma?: number;
  progress?: number;
};
