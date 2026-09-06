export type ExperimentCommand = {
  id: number;
  lab: 'well' | 'oscillator' | 'scattering' | 'double-well';
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
  barrier?: number;
  separation?: number;
};
