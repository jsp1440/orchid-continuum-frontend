import { createContext } from 'react';
import type { MissionControlContextValue } from '@/lib/mission-control/MissionControlTypes';

export const MissionControlContext = createContext<MissionControlContextValue | null>(null);
