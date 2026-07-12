import { useContext, useMemo } from 'react';
import { MissionControlContext } from '@/lib/mission-control/MissionControlContext';
import { missionStatusToCardState } from '@/lib/mission-control/MissionControlTypes';

export function useMissionControl() {
  const context = useContext(MissionControlContext);
  if (!context) throw new Error('useMissionControl must be used within MissionControlProvider');
  const dataAgeMs = useMemo(() => {
    if (!context.meta.lastSuccessfulSync) return null;
    return Date.now() - new Date(context.meta.lastSuccessfulSync).getTime();
  }, [context.meta.lastSuccessfulSync]);
  return { ...context, dataAgeMs };
}

export { missionStatusToCardState };
