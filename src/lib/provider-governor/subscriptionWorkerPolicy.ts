export const FORBIDDEN_MODEL_API_ENV = [
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
] as const;

export type SubscriptionWorkerPreflightInput = {
  env: Record<string, string | undefined>;
  codexAvailable: boolean;
  codexAccountType: string | null;
};

export type SubscriptionWorkerPreflightDecision = {
  allowed: boolean;
  authMode: 'chatgpt-subscription' | 'unknown';
  reason:
    | 'ready'
    | 'model_api_key_present'
    | 'codex_cli_missing'
    | 'codex_not_logged_in_with_chatgpt';
  forbiddenEnv: string[];
};

export function findForbiddenModelApiEnv(
  env: Record<string, string | undefined>,
): string[] {
  return FORBIDDEN_MODEL_API_ENV.filter((name) => Boolean(env[name]?.trim()));
}

export function codexUsesChatGPTSubscription(accountType: string | null): boolean {
  return accountType?.trim().toLowerCase() === 'chatgpt';
}

export function evaluateSubscriptionWorkerPreflight(
  input: SubscriptionWorkerPreflightInput,
): SubscriptionWorkerPreflightDecision {
  const forbiddenEnv = findForbiddenModelApiEnv(input.env);
  if (forbiddenEnv.length > 0) {
    return {
      allowed: false,
      authMode: 'unknown',
      reason: 'model_api_key_present',
      forbiddenEnv,
    };
  }

  if (!input.codexAvailable) {
    return {
      allowed: false,
      authMode: 'unknown',
      reason: 'codex_cli_missing',
      forbiddenEnv: [],
    };
  }

  if (!codexUsesChatGPTSubscription(input.codexAccountType)) {
    return {
      allowed: false,
      authMode: 'unknown',
      reason: 'codex_not_logged_in_with_chatgpt',
      forbiddenEnv: [],
    };
  }

  return {
    allowed: true,
    authMode: 'chatgpt-subscription',
    reason: 'ready',
    forbiddenEnv: [],
  };
}
