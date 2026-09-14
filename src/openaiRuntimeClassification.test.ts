import { describe, expect, it } from 'vitest';

import {
  classifyOpenAIRuntime,
  redactDiagnostic,
} from '../scripts/classify-openai-runtime.mjs';

describe('OpenAI runtime classification', () => {
  it('treats explicit API auth/scope failures as security', () => {
    for (const stderr of [
      'HTTP 401 Unauthorized',
      'HTTP 403 Forbidden',
      'invalid_api_key',
      'missing scope: api.responses.write',
      'insufficient permissions for API operation',
    ]) {
      expect(
        classifyOpenAIRuntime({ outcome: 'failure', stderr, statusMarker: '', exitCode: '1' }),
      ).toBe('security');
    }
  });

  it('does not infer security from broad permission words in stdout', () => {
    expect(
      classifyOpenAIRuntime({
        outcome: 'failure',
        stderr: 'unexpected argument --ask-for-approval',
        statusMarker: '',
        exitCode: '1',
        stdout: 'sandbox permission policy',
      } as never),
    ).toBe('runtime_config');
  });

  it('classifies provider capacity separately from security', () => {
    for (const stderr of ['429 rate limit', 'quota exceeded', 'service unavailable', 'connection reset']) {
      expect(
        classifyOpenAIRuntime({ outcome: 'failure', stderr, statusMarker: '', exitCode: '1' }),
      ).toBe('safe_provider');
    }
  });

  it('classifies missing configuration explicitly', () => {
    expect(
      classifyOpenAIRuntime({ outcome: 'failure', stderr: '', statusMarker: 'config_missing', exitCode: '20' }),
    ).toBe('config');
  });

  it('redacts keys and bearer tokens from bounded diagnostics', () => {
    const redacted = redactDiagnostic(
      'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz\nAuthorization: Bearer secret-token\n',
    );
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('secret-token');
    expect(redacted).toContain('[REDACTED');
  });
});
