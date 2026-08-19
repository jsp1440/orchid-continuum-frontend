import React from 'react';
import AtlasNextShell from '@/features/atlas-next/AtlasNextShell';

/**
 * ATLAS-NEXT — candidate route.
 *
 * Deliberately isolated. `/atlas` is untouched and remains the Atlas the site
 * ships; this route exists so the reconciled globe can be reviewed against it
 * before anything is proposed for cutover.
 */
const AtlasNext: React.FC = () => <AtlasNextShell />;

export default AtlasNext;
