import { existsSync, readFileSync } from 'node:fs';

const env = process.env;
const stderrPath = env.STDERR_PATH || '';
const stdoutPath = env.STDOUT_PATH || '';
const statusPath = env.STATUS_PATH || '';
const exitPath = env.EXIT_PATH || '';
const outcome = env.PROBE_OUTCOME || 'failure';

const read = (path) => (path && existsSync(path) ? readFileSync(path, 'utf8') : '');
const stderr = read(stderrPath);
const stdout = read(stdoutPath);
const statusMarker = read(statusPath).trim();
const exitCode = read(exitPath).trim();

export function classifyOpenAIRuntime({ outcome, stderr, statusMarker, exitCode }) {
  if (outcome === 'success') return 'healthy';
  if (statusMarker === 'config_missing') return 'config';

  // Security is intentionally stderr-only and limited to explicit API auth/scope signals.
  const explicitSecurity = /(?:^|[^0-9])(?:401|403)(?:[^0-9]|$)|unauthori[sz]ed|invalid[_ .-]?api[_ .-]?key|authentication (?:failed|required)|missing scopes?:|insufficient permissions?.*(?:api|operation)|api\.responses\.write/i;
  if (explicitSecurity.test(stderr)) return 'security';

  const safeProvider = /429|quota|rate.?limit|billing|credit|overloaded|service unavailable|temporarily unavailable|timeout|timed out|connection|websocket.*(?:reset|closed|failed)/i;
  if (safeProvider.test(stderr) || exitCode === '124') return 'safe_provider';

  const runtimeConfig = /unknown (?:argument|option)|unexpected argument|unrecognized option|usage:|config.*(?:invalid|error)|failed to (?:load|parse).*config|permission denied|operation not permitted|sandbox.*(?:denied|permission)|workspace.*trust|unsupported.*(?:flag|option|model)/i;
  if (runtimeConfig.test(stderr)) return 'runtime_config';

  return 'unknown';
}

export function redactDiagnostic(text) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/(Authorization:\s*Bearer)\s+\S+/gi, '$1 [REDACTED]')
    .replace(/(OPENAI_API_KEY=)\S+/g, '$1[REDACTED]')
    .split(/\r?\n/)
    .slice(-20)
    .join('\n')
    .slice(-4000);
}

const kind = classifyOpenAIRuntime({ outcome, stderr, statusMarker, exitCode });
console.log(`OpenAI classification: kind=${kind} exit=${exitCode || 'unknown'}`);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\n`);
}

if (outcome !== 'success') {
  const diagnostic = redactDiagnostic(stderr);
  console.log('OpenAI redacted stderr diagnostic:');
  console.log(diagnostic || '[no stderr]');

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### OpenAI runtime diagnostic\n\nclassification: \`${kind}\`\nexit: \`${exitCode || 'unknown'}\`\n\n\`\`\`text\n${diagnostic}\n\`\`\`\n`,
    );
  }
}

// Never print stdout: Codex stdout can contain prompt/model content and broad words such as
// "permission" that are not authentication evidence. The workflow can inspect stdout only
// for a narrowly expected success marker if needed.
void stdout;
