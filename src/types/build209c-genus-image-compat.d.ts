import type { ImageSource } from '@/lib/genusData';

declare global {
  /**
   * Temporary compatibility guard for older DailyGenusFeatureV4 code paths that
   * accidentally reference a global `source` variable instead of the function
   * argument `sourceView`. The runtime shim in index.html prevents a hard page
   * crash until the component is fully consolidated.
   */
  const source: ImageSource | null | undefined;
}

declare module '@/lib/genusData' {
  interface GenusImage {
    /** Legacy typo retained as a compatibility field for older fallback records. */
    image_sourceView?: string;
  }
}

export {};
