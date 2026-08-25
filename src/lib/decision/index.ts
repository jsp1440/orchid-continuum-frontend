/**
 * The Orchid Continuum evidence-to-decision layer.
 *
 * A single, governed path from a complex question to a review-gated, cited,
 * reproducible decision artifact — binding the existing evidence retrieval,
 * research workspace, Check Calyx / Verification Workbench, and dossier systems
 * together rather than duplicating any of them.
 *
 * See ./contracts for the canonical types and the integrity rules they encode,
 * and ./phalaenopsisSlice for the first end-to-end vertical slice.
 */

export * from "./contracts";
export * from "./fingerprint";
export * from "./claims";
export * from "./synthesis";
export * from "./orchestration";
export * from "./artifact";
export * from "./phalaenopsisSlice";
