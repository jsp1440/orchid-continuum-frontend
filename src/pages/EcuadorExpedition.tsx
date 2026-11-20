import { Navigate } from 'react-router-dom';
import { ECUADOR_DISCOVERY_URL } from '@/features/atlas-next/ecuadorDiscovery';

export default function EcuadorExpedition() {
  return <Navigate to={ECUADOR_DISCOVERY_URL} replace />;
}
