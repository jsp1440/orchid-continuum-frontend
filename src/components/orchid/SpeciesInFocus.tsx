import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bug,
  Leaf,
  MapPin,
  Search,
  ShieldAlert,
  Star,
  Trees,
} from 'lucide-react';
import { conservationBadge, binomialOf } from '@/lib/genusData';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import {
  getFeaturedSpeciesCached,
  getNeighborOrchidsCached,
  isFavorite,
  toggleFavorite,
  subscribeFavorites,
  type FeaturedSpecies,
} from '@/lib/speciesFeature';

const TARGET_COUNT = 6;

const GENUS_SUGGESTIONS = [
  'Cattleya',
  'Dendrobium',
  'Phalaenopsis',
  'Paphiopedilum',
  'Oncidium',
  'Masdevallia',
  'Dracula',
  'Bulbophyllum',
  'Vanda',
  'Cymbidium',
  'Pleurothallis',
  'Maxillaria',
  'Epidendrum',
  'Catasetum',
  'Vanilla',
];

const useIsFavorite = (name: string) =>
  useSyncExternalStore(
    subscribeFavorites,
    () => isFavorite(name),
    () => false,
  );

function normalizeGenus(raw: string): string {
  const g = raw.trim();
  if (!g) return '';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function isFullBinomial(name: string): boolean {
  return /^[A-Z][A-Za-z-]+\s+[a-z][a-z-]+/.test(name.trim
