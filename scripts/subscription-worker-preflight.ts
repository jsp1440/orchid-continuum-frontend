import { spawnSync } from 'node:child_process';
import {
  evaluateSubscriptionWorkerPreflight,
  type SubscriptionWorkerPreflightDecision,
} from '../src/lib/provider-governor/subscriptionWorkerPolicy';

function runCodex(args: string[]) {
  return spawnSync('codex', args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function emit(decision: SubscriptionWorkerPreflightDecision, details: Record<string, unknown>) {
  const payload = {
    worker: 'codex',
    ...decision,
    ...details,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const version = runCodex(['--version']);
const codexAvailable = !version.error && version.status === 0;
let authOutput = '';
let authStatus: number | null = null;

if (codexAvailable) {
  const auth = runCodex(['login', 'status']);
  authStatus = auth.status;
  authOutput = `${auth.stdout ?? ''}\n${auth.stderr ?? ''}`.trim();
}

const decision = evaluateSubscriptionWorkerPreflight({
  env: process.env,
  codexAvailable,
  codexAuthOutput: authOutput,
});

emit(decision, {
  codexVersion: codexAvailable ? String(version.stdout ?? '').trim() : null,
  authStatus,
});

if (!decision.allowed) {
  process.exitCode = 2;
}
