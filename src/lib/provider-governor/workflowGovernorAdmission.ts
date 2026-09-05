import {
  decideProviderDispatch,
  type DispatchDecision,
  type GovernorState,
  type Provider,
  type ProviderPolicy,
  type WorkUnit,
} from './providerGovernor';

export interface WorkflowGovernorConfig {
  noApiMode: boolean;
  materialWorkThreshold: number;
  minimumDispatchIntervalMs: number;
  dailyMaxCalls: number;
  waveMaxCalls: number;
  providerPriority?: Partial<Record<Provider, number>>;
  disabledProviders?: Provider[];
}

export interface WorkflowGovernorAdmissionInput {
  now: string;
  work: WorkUnit[];
  state: GovernorState;
  config: WorkflowGovernorConfig;
}

export interface WorkflowGovernorAdmission {
  allowPaidExecution: boolean;
  provider: Provider | null;
  reason: string;
  fingerprint: string;
  telemetry: DispatchDecision['telemetry'];
}

const PROVIDERS: Provider[] = ['anthropic', 'gemini', 'openai'];

/**
 * Workflow-facing adapter for the provider governor. It intentionally contains
 * no credentials, SDK imports, shell execution, or network calls. Workflows can
 * call this before any provider step and use allowPaidExecution/provider as the
 * only authorization signal.
 */
export function admitWorkflowProviderExecution(input: WorkflowGovernorAdmissionInput): WorkflowGovernorAdmission {
  const disabled = new Set(input.config.disabledProviders ?? []);
  const priority = input.config.providerPriority ?? { anthropic: 10, gemini: 20, openai: 30 };

  const policies = Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      {
        state: disabled.has(provider) ? 'disabled' : 'enabled',
        priority: priority[provider] ?? 100,
        minimumDispatchIntervalMs: input.config.minimumDispatchIntervalMs,
        dailyMaxCalls: input.config.dailyMaxCalls,
        dailyMaxTokens: null,
        dailyMaxCostUsd: null,
        waveMaxCalls: input.config.waveMaxCalls,
        waveMaxTokens: null,
        waveMaxCostUsd: null,
      } satisfies ProviderPolicy,
    ]),
  ) as Record<Provider, ProviderPolicy>;

  const decision = decideProviderDispatch({
    now: input.now,
    work: input.work,
    policies,
    state: { ...input.state, noApiMode: input.config.noApiMode || input.state.noApiMode },
    materialWorkThreshold: input.config.materialWorkThreshold,
  });

  return {
    allowPaidExecution: decision.dispatch,
    provider: decision.dispatch ? decision.provider : null,
    reason: decision.reason,
    fingerprint: decision.fingerprint,
    telemetry: decision.telemetry,
  };
}
