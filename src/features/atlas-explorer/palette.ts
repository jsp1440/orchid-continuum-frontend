/** Atlas Explorer colours. Chosen for contrast on light basemaps and distinguishable without hue alone (generalised points also differ in fill and stroke). */

export type ColorMode = 'default' | 'record-age' | 'conservation-assessment';

export const PALETTE = {
  point: '#0f766e',
  pointStroke: '#ffffff',
  generalised: '#b45309',
  selected: '#111827',
  cluster: '#115e59',
  age: { 'pre-1950': '#7c3aed', '1950-1999': '#2563eb', '2000-plus': '#059669', undated: '#9ca3af' },
  assessment: { threatened: '#dc2626', 'not-threatened': '#0f766e', unresolved: '#6b7280' },
};
