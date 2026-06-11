import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface HeroSpeciesState {
  species: string;
  genus: string;
  image?: string;
  habitat?: string;
  pollinator?: string;
  fungi?: string;
  region?: string;
}

interface HeroSpeciesContextValue {
  heroSpecies: HeroSpeciesState | null;
  setHeroSpecies: (species: HeroSpeciesState | null) => void;
}

const HeroSpeciesContext =
  createContext<HeroSpeciesContextValue | null>(null);

export const HeroSpeciesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [heroSpecies, setHeroSpecies] =
    useState<HeroSpeciesState | null>(null);

  const value = useMemo(
    () => ({
      heroSpecies,
      setHeroSpecies,
    }),
    [heroSpecies],
  );

  return (
    <HeroSpeciesContext.Provider value={value}>
      {children}
    </HeroSpeciesContext.Provider>
  );
};

export function useHeroSpecies() {
  const ctx = useContext(HeroSpeciesContext);

  if (!ctx) {
    throw new Error(
      'useHeroSpecies must be used inside HeroSpeciesProvider',
    );
  }

  return ctx;
}
