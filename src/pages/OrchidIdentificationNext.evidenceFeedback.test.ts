import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/pages/OrchidIdentificationNext.tsx'),
  'utf8',
);

describe('Matrix identification evidence feedback', () => {
  it('attaches challenges to the exact displayed session revision', () => {
    expect(source).toContain('matrixEvidenceFeedbackPayload(evaluation)');
    expect(source).toContain('key={`${session.session_id}:${session.revision}`}');
    expect(source).toContain('objectId={`matrix-identification:${session.session_id}`}');
    expect(source).toContain('objectType="matrix_identification"');
    expect(source).toContain('initialFeedbackClass="challenge"');
  });

  it('keeps Matrix feedback on the governed identification route', () => {
    expect(source).toContain('pageContext="/orchid-identification"');
    expect(source).toContain('objectPayload={feedbackPayload}');
  });
});
