import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import {
  evaluateSubscriptionWorkerPreflight,
  type SubscriptionWorkerPreflightDecision,
} from '../src/lib/provider-governor/subscriptionWorkerPolicy';

type AccountProbe = {
  accountType: string | null;
  planType: string | null;
};

function emit(decision: SubscriptionWorkerPreflightDecision, details: Record<string, unknown>) {
  process.stdout.write(
    `${JSON.stringify({ worker: 'codex', ...decision, ...details })}\n`,
  );
}

async function readCodexAccount(): Promise<AccountProbe> {
  const proc = spawn('codex', ['app-server'], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = readline.createInterface({ input: proc.stdout });
  let settled = false;

  return await new Promise<AccountProbe>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('codex app-server auth probe timed out')), 10_000);

    function cleanup() {
      clearTimeout(timer);
      lines.close();
      if (!proc.killed) proc.kill();
    }

    function finish(error: Error | null, value?: AccountProbe) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value ?? { accountType: null, planType: null });
    }

    function send(message: unknown) {
      proc.stdin.write(`${JSON.stringify(message)}\n`);
    }

    proc.on('error', (error) => finish(error));
    proc.on('exit', (code) => {
      if (!settled && code !== null) finish(new Error(`codex app-server exited with code ${code}`));
    });

    lines.on('line', (line) => {
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === 0) {
        if (message.error) {
          finish(new Error(`codex app-server initialize failed: ${JSON.stringify(message.error)}`));
          return;
        }
        send({ method: 'initialized', params: {} });
        send({ method: 'account/read', id: 1, params: { refreshToken: false } });
        return;
      }

      if (message.id === 1) {
        if (message.error) {
          finish(new Error(`codex account/read failed: ${JSON.stringify(message.error)}`));
          return;
        }
        const account = message.result?.account ?? null;
        finish(null, {
          accountType: typeof account?.type === 'string' ? account.type : null,
          planType: typeof account?.planType === 'string' ? account.planType : null,
        });
      }
    });

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'orchid_continuum_worker',
          title: 'Orchid Continuum Worker',
          version: '0.1.0',
        },
      },
    });
  });
}

async function main() {
  const version = spawnSync('codex', ['--version'], {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const codexAvailable = !version.error && version.status === 0;
  let probe: AccountProbe = { accountType: null, planType: null };
  let probeError: string | null = null;

  if (codexAvailable) {
    try {
      probe = await readCodexAccount();
    } catch (error) {
      probeError = error instanceof Error ? error.message : String(error);
    }
  }

  const decision = evaluateSubscriptionWorkerPreflight({
    env: process.env,
    codexAvailable,
    codexAccountType: probe.accountType,
  });

  emit(decision, {
    codexVersion: codexAvailable ? String(version.stdout ?? '').trim() : null,
    accountType: probe.accountType,
    planType: probe.planType,
    probeError,
  });

  if (!decision.allowed) process.exitCode = 2;
}

await main();
