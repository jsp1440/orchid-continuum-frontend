import { describe, expect, it } from 'vitest';
import {
  codexUsesChatGPTSubscription,
  evaluateSubscriptionWorkerPreflight,
  findForbiddenModelApiEnv,
} from './subscriptionWorkerPolicy';

describe('subscription worker preflight policy', () => {
  it('accepts Codex only when auth is explicitly ChatGPT subscription based', () => {
    expect(codexUsesChatGPTSubscription('Logged in using ChatGPT')).toBe(true);
    expect(codexUsesChatGPTSubscription('Logged in using API key')).toBe(false);
    expect(codexUsesChatGPTSubscription('Logged in')).toBe(false);
  });

  it('detects every forbidden model API environment variable', () => {
    expect(
      findForbiddenModelApiEnv({
        OPENAI_API_KEY: 'x',
        CODEX_API_KEY: 'x',
        ANTHROPIC_API_KEY: 'x',
        GEMINI_API_KEY: 'x',
        GOOGLE_API_KEY: 'x',
      }),
    ).toEqual([
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
    ]);
  });

  it('fails closed before worker execution when a model API key is present', () => {
    expect(
      evaluateSubscriptionWorkerPreflight({
        env: { OPENAI_API_KEY: 'sk-test' },
        codexAvailable: true,
        codexAuthOutput: 'Logged in using ChatGPT',
      }),
    ).toEqual({
      allowed: false,
      authMode: 'unknown',
      reason: 'model_api_key_present',
      forbiddenEnv: ['OPENAI_API_KEY'],
    });
  });

  it('fails closed if Codex is unavailable', () => {
    expect(
      evaluateSubscriptionWorkerPreflight({
        env: {},
        codexAvailable: false,
        codexAuthOutput: '',
      }).reason,
    ).toBe('codex_cli_missing');
  });

  it('fails closed if Codex is not logged in through ChatGPT', () => {
    expect(
      evaluateSubscriptionWorkerPreflight({
        env: {},
        codexAvailable: true,
        codexAuthOutput: 'Logged in using API key',
      }).reason,
    ).toBe('codex_not_logged_in_with_chatgpt');
  });

  it('admits only the ChatGPT subscription path', () => {
    expect(
      evaluateSubscriptionWorkerPreflight({
        env: {},
        codexAvailable: true,
        codexAuthOutput: 'Logged in using ChatGPT',
      }),
    ).toEqual({
      allowed: true,
      authMode: 'chatgpt-subscription',
      reason: 'ready',
      forbiddenEnv: [],
    });
  });
});
