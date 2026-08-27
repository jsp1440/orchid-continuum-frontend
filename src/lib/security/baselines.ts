/**
 * Bounded behavioral baselines.
 *
 * Baselines are computed only where sufficient data exists. They are
 * intentionally simple (rolling mean + stddev over a window) and explainable —
 * no personal psychological profiling, no ML. A deviation is an INVESTIGATIVE
 * signal, never a conclusion, and a person is never labeled malicious.
 *
 * Every baseline exposes:
 *  - the window used,
 *  - the sample size,
 *  - a cold-start flag when there is not enough data,
 *  - the mean/stddev so the Trust Center can show "the baseline used" and
 *    "why an event differs".
 *
 * Dimensions are things like normal API volume by service, model/tool call
 * frequency by mission type, db read/write ratio by service, ingestion volume
 * by source, error/denial rates. See docs/security/PRIVACY_RETENTION.md for the
 * retention/deletion behavior of baseline aggregates.
 */

import type { BaselineStat } from './signals';

export interface BaselineSample {
  dimension: string;
  key: string;
  value: number;
  /** Sample timestamp (ISO). Used for rolling-window trimming. */
  at: string;
}

export interface BaselineOptions {
  /** Rolling window length in ms. */
  windowMs: number;
  /** Minimum samples before a baseline is considered warm. */
  minSamples: number;
  /** Label shown to reviewers, e.g. "trailing 14d". */
  windowLabel: string;
}

export const DEFAULT_BASELINE_OPTIONS: BaselineOptions = {
  windowMs: 14 * 24 * 60 * 60 * 1000,
  minSamples: 30,
  windowLabel: 'trailing 14d',
};

interface Aggregate {
  values: number[];
  timestamps: number[];
}

/**
 * A bounded, in-memory baseline store. Not a database — a backend worker would
 * persist rolled-up aggregates. This class is deterministic and fully testable.
 */
export class BaselineStore {
  private readonly data = new Map<string, Aggregate>();

  constructor(private readonly options: BaselineOptions = DEFAULT_BASELINE_OPTIONS) {}

  private static id(dimension: string, key: string): string {
    return `${dimension}::${key}`;
  }

  /** Add a sample and trim anything outside the rolling window. */
  add(sample: BaselineSample): void {
    const id = BaselineStore.id(sample.dimension, sample.key);
    const agg = this.data.get(id) ?? { values: [], timestamps: [] };
    agg.values.push(sample.value);
    agg.timestamps.push(Date.parse(sample.at));
    this.data.set(id, agg);
    this.trim(id, Date.parse(sample.at));
  }

  private trim(id: string, nowMs: number): void {
    const agg = this.data.get(id);
    if (!agg) return;
    const cutoff = nowMs - this.options.windowMs;
    let drop = 0;
    while (drop < agg.timestamps.length && agg.timestamps[drop] < cutoff) drop += 1;
    if (drop > 0) {
      agg.values = agg.values.slice(drop);
      agg.timestamps = agg.timestamps.slice(drop);
    }
  }

  /** Look up a baseline stat, cold-start aware. Bindable as a BaselineLookup. */
  lookup = (dimension: string, key: string): BaselineStat | undefined => {
    const agg = this.data.get(BaselineStore.id(dimension, key));
    if (!agg || agg.values.length === 0) {
      return {
        mean: 0,
        stddev: 0,
        sampleSize: 0,
        coldStart: true,
        windowLabel: this.options.windowLabel,
      };
    }
    const n = agg.values.length;
    const mean = agg.values.reduce((a, b) => a + b, 0) / n;
    const variance =
      n > 1
        ? agg.values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
        : 0;
    return {
      mean,
      stddev: Math.sqrt(variance),
      sampleSize: n,
      coldStart: n < this.options.minSamples,
      windowLabel: this.options.windowLabel,
    };
  };

  /** Coverage report for the metrics/analytics surface. */
  coverage(): { dimension: string; key: string; sampleSize: number; coldStart: boolean }[] {
    const out: { dimension: string; key: string; sampleSize: number; coldStart: boolean }[] = [];
    for (const [id, agg] of this.data) {
      const [dimension, key] = id.split('::');
      out.push({
        dimension,
        key,
        sampleSize: agg.values.length,
        coldStart: agg.values.length < this.options.minSamples,
      });
    }
    return out;
  }
}
