import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { fetchCalyxGenusMedia, type GenusMediaItem } from '@/lib/genusMediaResolver';
import { featuredGenusEntry } from '@/lib/featuredGenus';
import { lookupGenus } from '@/lib/genusData';

export type HomepageFeaturedAvailability = 'loading' | 'ready' | 'no_media' | 'error';

export interface HomepageFeaturedContextValue {
  genus: string;
  activeSpecies: string | null;
  activeTaxonId: string | null;
  activeMedia: GenusMediaItem | null;
  media: GenusMediaItem[];
  attribution: string | null;
  license: string | null;
  mediaSource: string | null;
  regionSummary: string | null;
  habitatSummary: string | null;
  elevationSummary: string | null;
  climateSummary: string | null;
  occurrenceAvailability: 'unknown' | 'available' | 'unavailable';
  relationshipAvailability: 'unknown' | 'available' | 'unavailable';
  provenanceState: 'approved_media' | 'local_profile_only' | 'unavailable';
  availability: HomepageFeaturedAvailability;
  errorMessage: string | null;
  selectSpecies: (scientificName: string) => void;
}

const HomepageFeaturedContext = createContext<HomepageFeaturedContextValue | null>(null);

export const HomepageFeaturedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { genus } = useDailyGenus();
  const [media, setMedia] = useState<GenusMediaItem[]>([]);
  const [availability, setAvailability] = useState<HomepageFeaturedAvailability>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSpecies, setActiveSpecies] = useState<string | null>(null);

  const entry = useMemo(() => lookupGenus(genus) ?? featuredGenusEntry(), [genus]);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability('loading');
    setErrorMessage(null);
    setMedia([]);
    setActiveSpecies(null);

    void fetchCalyxGenusMedia(genus, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setMedia(response.items);
        if (response.status === 'ok' && response.items.length > 0) {
          setActiveSpecies(response.items[0].scientific_name);
          setAvailability('ready');
          return;
        }
        if (response.status === 'no_approved_media' || response.status === 'invalid_genus') {
          setAvailability('no_media');
          return;
        }
        setAvailability('error');
        setErrorMessage('Approved Featured Genus media could not be loaded.');
      })
      .catch((error) => {
        if ((error as Error)?.name === 'AbortError') return;
        setAvailability('error');
        setErrorMessage('Approved Featured Genus media could not be loaded.');
      });

    return () => controller.abort();
  }, [genus]);

  const activeMedia = useMemo(
    () => media.find((item) => item.scientific_name === activeSpecies) ?? media[0] ?? null,
    [media, activeSpecies],
  );

  const value = useMemo<HomepageFeaturedContextValue>(() => ({
    genus,
    activeSpecies: activeMedia?.scientific_name ?? activeSpecies,
    activeTaxonId: activeMedia?.taxon_id ?? null,
    activeMedia,
    media,
    attribution: activeMedia?.attribution ?? null,
    license: activeMedia?.license ?? null,
    mediaSource: activeMedia?.source_name ?? null,
    regionSummary: entry.regions?.length ? entry.regions.join(', ') : null,
    habitatSummary: entry.ecology?.habitat || null,
    elevationSummary: entry.ecology?.elevation || null,
    climateSummary: null,
    occurrenceAvailability: 'unknown',
    relationshipAvailability:
      entry.ecology?.pollinatorGuild || entry.ecology?.mycorrhizal ? 'available' : 'unknown',
    provenanceState: activeMedia ? 'approved_media' : entry ? 'local_profile_only' : 'unavailable',
    availability,
    errorMessage,
    selectSpecies: (scientificName: string) => {
      if (media.some((item) => item.scientific_name === scientificName)) {
        setActiveSpecies(scientificName);
      }
    },
  }), [genus, activeMedia, activeSpecies, media, entry, availability, errorMessage]);

  return (
    <HomepageFeaturedContext.Provider value={value}>
      {children}
    </HomepageFeaturedContext.Provider>
  );
};

export function useHomepageFeatured(): HomepageFeaturedContextValue {
  const context = useContext(HomepageFeaturedContext);
  if (!context) throw new Error('useHomepageFeatured must be used inside HomepageFeaturedProvider');
  return context;
}
