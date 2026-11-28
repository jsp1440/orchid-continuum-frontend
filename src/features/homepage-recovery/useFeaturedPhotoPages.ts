import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { GenusMediaItem } from '@/lib/genusMediaResolver';
import { normalizedMediaKey } from '@/lib/genusProfileDataQuality';
import { featuredSpeciesLabel } from './featuredSpecies';
import { fetchFeaturedPhotoPage, PhotoPageError } from './featuredPhotoPages';

const BATCH_PAGES = 3;

/** The gallery mounts once per 12-hour genus selection. Keep its working photos in stable order as pages arrive. */
export function useFeaturedPhotoPages(genus: string, fallback: GenusMediaItem[], visible: boolean, selection: { name: string | null; index: number }, failed: string[]) {
  const client = useQueryClient();
  const queryKey = useMemo(() => ['featured-species-photo-page', genus], [genus]);
  const query = useInfiniteQuery({
    queryKey, enabled: visible, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchFeaturedPhotoPage(genus, pageParam, signal),
    getNextPageParam: last => last.next ?? undefined, staleTime: Infinity, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const pages = query.data?.pages;
  const [ordered, setOrdered] = useState(fallback);
  const [appliedPages, setAppliedPages] = useState<typeof pages>();
  useEffect(() => {
    const incoming = [...fallback, ...(pages?.flatMap(page => page.items) ?? [])]
      .filter(item => !failed.includes(item.image_url));
    const assetKey = (item: GenusMediaItem) => JSON.stringify([featuredSpeciesLabel(item.scientific_name).toLowerCase(), normalizedMediaKey(item.image_url)]);
    const currentAssets = new Map(incoming.map(item => [assetKey(item), item]));
    setOrdered(previous => {
      // Keep visible places stable. An updated record for the same image carries
      // the latest credit, licence and dossier ID. An alternative can replace a broken embed.
      const existing = previous.map(item => currentAssets.get(assetKey(item))).filter(Boolean);
      const taxa = new Set<string>();
      const urls = new Set<string>();
      const next = [...existing, ...incoming].filter(item => {
        const name = featuredSpeciesLabel(item.scientific_name).toLowerCase();
        const url = normalizedMediaKey(item.image_url);
        if (taxa.has(name) || urls.has(url)) return false;
        taxa.add(name); urls.add(url); return true;
      });
      return next.length === previous.length && next.every((item, i) => item === previous[i]) ? previous : next;
    });
    setAppliedPages(pages);
  }, [fallback, pages, failed]);
  const count = pages?.length ?? 0;
  const cursor = pages?.[count - 1]?.next;
  const repeated = Boolean(cursor && query.data?.pageParams.includes(cursor));
  const [budget, setBudget] = useState(BATCH_PAGES);
  const resetNeeded = repeated || (query.error instanceof PhotoPageError && query.error.status === 409);
  const current = resetNeeded ? fallback : ordered;
  const items = useMemo(() => current.filter(item => !failed.includes(item.image_url)), [current, failed]);
  const selectedIndex = selection.name === null ? -1 : items.findIndex(item => featuredSpeciesLabel(item.scientific_name).toLowerCase() === selection.name);
  const index = selectedIndex >= 0 ? selectedIndex : Math.min(selection.index, Math.max(0, items.length - 1));
  const needsPage = items.length < index + 10;
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  useEffect(() => {
    if (visible && needsPage && hasNextPage && !isFetching && !isError && !repeated && count < budget) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [visible, needsPage, hasNextPage, isFetching, isError, repeated, count, budget, fetchNextPage]);
  const extend = useCallback(() => setBudget(previous => Math.max(previous, count + BATCH_PAGES)), [count]);
  const retry = () => {
    extend();
    if (resetNeeded) {
      setOrdered(fallback);
      void client.resetQueries({ queryKey, exact: true });
    } else if (count && hasNextPage) {
      void fetchNextPage({ cancelRefetch: false });
    } else {
      void query.refetch();
    }
  };
  return {
    items, index, extend, retry,
    unavailable: isError || repeated, loading: isFetching,
    canWrap: (count > 0 && pages === appliedPages && !hasNextPage && !repeated) || (count === 0 && isError),
    canSearch: needsPage && hasNextPage && !isFetching && !isError && !repeated && count >= budget,
  };
}
