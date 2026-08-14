import React, { createContext, useContext, useMemo, useState } from 'react';

export type HomepageAtlasTheme = 'distribution' | 'habitat' | 'climate' | 'relationships' | 'flowering' | 'conservation';
export type HomepageAtlasDataStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error';

export interface HomepageAtlasContextValue {
  activeTheme: HomepageAtlasTheme;
  setActiveTheme: (theme: HomepageAtlasTheme) => void;
  dataStatus: HomepageAtlasDataStatus;
  setDataStatus: (status: HomepageAtlasDataStatus) => void;
  interpretation: string | null;
  setInterpretation: (value: string | null) => void;
}

const Context = createContext<HomepageAtlasContextValue | null>(null);

export const HomepageAtlasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTheme, setActiveTheme] = useState<HomepageAtlasTheme>('distribution');
  const [dataStatus, setDataStatus] = useState<HomepageAtlasDataStatus>('idle');
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const value = useMemo(() => ({ activeTheme, setActiveTheme, dataStatus, setDataStatus, interpretation, setInterpretation }), [activeTheme, dataStatus, interpretation]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useHomepageAtlasContext(): HomepageAtlasContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useHomepageAtlasContext must be used inside HomepageAtlasProvider');
  return value;
}
