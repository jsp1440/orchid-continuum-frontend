#!/usr/bin/env node
import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function buildWaveContext(input = {}) {
  const packet = stable({
    schema: "oc-wave-context-v1",
    integrationSha: input.integrationSha || "unknown",
    governance: input.governance || [],
    architecture: input.architecture || {},
    completionGraph: input.completionGraph || {},
    prLineage: input.prLineage || [],
    repositoryState: input.repositoryState || {},
  });
  const canonical = JSON.stringify(packet);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return { hash, packet, canonical };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = raw.trim() ? JSON.parse(raw) : {};
  const result = buildWaveContext(input);
  process.stdout.write(`${JSON.stringify({ hash: result.hash, packet: result.packet }, null, 2)}\n`);
}
