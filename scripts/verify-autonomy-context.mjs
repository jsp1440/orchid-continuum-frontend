import fs from "node:fs";

const path = new URL("../contracts/oc-autonomy-context.v1.json", import.meta.url);
const context = JSON.parse(fs.readFileSync(path, "utf8"));

const requiredLoop = [
  "discover", "prioritize", "queue", "reconcile", "admit", "lease",
  "execute", "test", "validate", "evidence", "complete", "replenish",
];

const failures = [];
if (context.schema !== "oc.autonomy-context.v1") failures.push("wrong schema");
if (context.provider_neutral !== true) failures.push("context is not provider-neutral");
if (context.operating_rules?.provider_free_first !== true) failures.push("provider_free_first not enforced");
if (context.operating_rules?.fail_closed_on_unknown_capability !== true) failures.push("unknown capabilities do not fail closed");
if (context.operating_rules?.require_evidence_for_completion !== true) failures.push("completion evidence not required");
if (JSON.stringify(context.loop) !== JSON.stringify(requiredLoop)) failures.push("canonical loop drifted");
if (context.evaluation?.autonomy_proof_target !== 10) failures.push("autonomy proof target is not 10");

if (failures.length) {
  console.error("Canonical autonomy context validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Canonical autonomy context PASS ${context.schema} v${context.version}`);
