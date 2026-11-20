import React from 'react';
import { useSearchParams } from 'react-router-dom';
import EcuadorDiscovery from '@/features/atlas-next/EcuadorDiscovery';
import AtlasNextShell from '@/features/atlas-next/AtlasNextShell';

/**
 * ATLAS-NEXT — candidate route.
 *
 * Deliberately isolated. `/atlas` is untouched and remains the Atlas the site
 * ships; this route exists so the reconciled globe can be reviewed against it
 * before anything is proposed for cutover.
 */
const AtlasNext: React.FC = () => {
  const [params] = useSearchParams();
  return params.get('expedition') === 'ecuador' ? <EcuadorDiscovery /> : <AtlasNextShell />;
};

export default AtlasNext;
