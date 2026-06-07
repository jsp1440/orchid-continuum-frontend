/**
 * comparisons — persistence helpers for saved genus "comparisons".
 *
 * A comparison captures a focal genus plus the snapshot of its co-occurring
 * neighbour set (genus name + region + ecological relationship + photo) under a
 * user-supplied name. Rows live in `public.genus_comparisons`, tied to the
 * signed-in user via `user_id` and protected by row-level security so each
 * member only ever sees / mutates their own saved comparisons.
 */

import { supabase } from '@/lib/supabase';
import type { NeighborGenus } from '@/lib/genusData';

/** A single neighbour snapshot stored inside a saved comparison. */
export interface ComparisonNeighbor {
  genus: string;
  region?: string;
  relationship?: string;
  image?: string;
}

/** A saved comparison row as returned from the database. */
export interface SavedComparison {
  id: string;
  name: string;
  focal_genus: string;
  neighbor_genera: ComparisonNeighbor[];
  created_at: string;
}

/** Reduce live NeighborGenus objects to the lean stored shape. */
export function toComparisonNeighbors(list: NeighborGenus[]): ComparisonNeighbor[] {
  return list.map((n) => ({
    genus: n.genus,
    region: n.region || undefined,
    relationship: n.relationship || undefined,
    image: n.image || undefined,
  }));
}

/** Persist a new named comparison for the signed-in user. */
export async function saveComparison(params: {
  name: string;
  focalGenus: string;
  neighbors: NeighborGenus[];
}): Promise<{ ok: boolean; error?: string; comparison?: SavedComparison }> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: 'You must be signed in to save a comparison.' };

  const name = params.name.trim();
  if (!name) return { ok: false, error: 'Please give this comparison a name.' };

  try {
    const { data, error } = await supabase
      .from('genus_comparisons')
      .insert({
        user_id: user.id,
        name,
        focal_genus: params.focalGenus,
        neighbor_genera: toComparisonNeighbors(params.neighbors),
      })
      .select('id, name, focal_genus, neighbor_genera, created_at')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, comparison: data as SavedComparison };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save comparison.';
    return { ok: false, error: message };
  }
}

/** List all saved comparisons for the signed-in user, newest first. */
export async function listComparisons(): Promise<SavedComparison[]> {
  try {
    const { data, error } = await supabase
      .from('genus_comparisons')
      .select('id, name, focal_genus, neighbor_genera, created_at')
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return data as SavedComparison[];
  } catch {
    return [];
  }
}

/** Delete a saved comparison by id (RLS ensures ownership). */
export async function deleteComparison(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('genus_comparisons').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete comparison.';
    return { ok: false, error: message };
  }
}
