/**
 * Glossary Preparation Workflow (OC-AUTO-001) — public API.
 *
 * A self-contained, deterministic pipeline that turns raw glossary entries
 * (CSV or JSON) into a reviewable publication package: normalized JSON, one
 * Markdown review page per accepted term (each with a deterministic scientific
 * illustration prompt), a machine-readable rejection report, and proposed
 * Knowledge Graph publication metadata.
 *
 * It performs NO network calls, NO external AI/illustration calls, NO database
 * writes, and NO Knowledge Graph publication. See
 * docs/GLOSSARY-PREPARATION-WORKFLOW.md.
 */

export * from './types.ts';
export * from './normalize.ts';
export * from './parse.ts';
export * from './validate.ts';
export * from './illustrationPrompt.ts';
export * from './knowledgeGraph.ts';
export * from './workflow.ts';
export * from './render.ts';
export * from './run.ts';
