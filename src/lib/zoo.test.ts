import { describe, expect, it } from 'vitest';

import { ApiError } from './api';
import { interpretZooQueue } from './zoo';

// SYNTHETIC SHAPES: the public zoo queue API is not reachable from tests.
const item = { submission_id: 'synthetic-1', review_state: 'pending' };

describe('interpretZooQueue', () => {
  it('keeps an outage distinct from an empty queue', () => {
    expect(interpretZooQueue({ data: null, error: new ApiError('down', 503, '/api/zoo/queue'), unconfigured: false }).kind).toBe(
      'unavailable',
    );
    expect(interpretZooQueue({ data: null, error: null, unconfigured: true }).kind).toBe('unavailable');
    expect(interpretZooQueue({ data: [], error: null, unconfigured: false })).toEqual({ kind: 'empty' });
  });

  it('fails closed on a payload that is not a list of well-formed submissions', () => {
    for (const data of [null, {}, { items: [item] }, [{}], [{ submission_id: '' }], [{ ...item, review_state: 'approved' }], [{ ...item, thumbnail_url: 7 }]]) {
      expect(interpretZooQueue({ data, error: null, unconfigured: false }).kind, JSON.stringify(data)).toBe('unavailable');
    }
  });

  it('passes live submissions through unchanged', () => {
    expect(interpretZooQueue({ data: [item], error: null, unconfigured: false })).toEqual({ kind: 'present', items: [item] });
  });
});
