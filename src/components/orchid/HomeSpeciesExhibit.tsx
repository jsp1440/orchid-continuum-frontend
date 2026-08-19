import React from 'react';
import SpeciesExhibit from '@/components/orchid/SpeciesExhibit';
import { useDailyGenus } from '@/lib/dailyGenusContext';

/**
 * Mounts the species exhibit against the genus the rest of the homepage is
 * already showing, so the cards are about the orchid in front of the visitor.
 * Every claim on a card comes from the server-owned evidence packet; this
 * wrapper adds none of its own.
 */
const HomeSpeciesExhibit: React.FC = () => {
  const { genus } = useDailyGenus();
  if (!genus) return null;
  return <SpeciesExhibit genus={genus} />;
};

export default HomeSpeciesExhibit;
