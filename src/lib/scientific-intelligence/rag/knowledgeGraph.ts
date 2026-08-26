/**
 * A minimal idempotent, provenance-bearing knowledge graph for the slice.
 *
 * Every scientific edge is traceable to the claim and source passage that
 * support it. Applying the same claim twice does not create a duplicate edge
 * (idempotent on a deterministic edge key), so replay is safe. Edges derived
 * from ambiguous taxa, quarantined claims, or protected content are stored in a
 * `restricted` activation state and never presented as unrestricted
 * authoritative knowledge.
 */

import { SensitivityClass } from './contracts'
import { shortHash } from './hash'

export type GraphNode = {
  nodeId: string
  kind: 'taxon'
  label: string
  acceptedName: string | null
  originalNames: string[]
}

export type GraphEdgeActivation = 'authoritative' | 'restricted'

export type GraphEdge = {
  edgeId: string
  subjectNodeId: string
  predicate: string
  object: string
  activation: GraphEdgeActivation
  provenance: {
    claimId: string
    sourceDocumentId: string
    supportingPassage: string
    passageSpan: { start: number; end: number }
    contentHash: string
    taxonomyVersion: string
    extractorVersion: string
  }
  sensitivity: SensitivityClass
  createdAt: string
  updatedAt: string
}

export type UpsertEdgeInput = {
  subjectTaxonId: string
  subjectAcceptedName: string | null
  subjectOriginalName: string
  predicate: string
  object: string
  activation: GraphEdgeActivation
  claimId: string
  sourceDocumentId: string
  supportingPassage: string
  passageSpan: { start: number; end: number }
  contentHash: string
  taxonomyVersion: string
  extractorVersion: string
  sensitivity: SensitivityClass
}

export type UpsertEdgeOutcome = { edge: GraphEdge; created: boolean }

export class KnowledgeGraph {
  private readonly nodes = new Map<string, GraphNode>()
  private readonly edges = new Map<string, GraphEdge>()

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  private edgeKey(input: Pick<UpsertEdgeInput, 'subjectTaxonId' | 'predicate' | 'object' | 'claimId'>): string {
    return `${input.subjectTaxonId}|${input.predicate}|${input.object}|${input.claimId}`
  }

  private ensureNode(input: UpsertEdgeInput): GraphNode {
    const existing = this.nodes.get(input.subjectTaxonId)
    if (existing) {
      if (!existing.originalNames.includes(input.subjectOriginalName)) {
        existing.originalNames.push(input.subjectOriginalName)
      }
      return existing
    }
    const node: GraphNode = {
      nodeId: input.subjectTaxonId,
      kind: 'taxon',
      label: input.subjectAcceptedName ?? input.subjectOriginalName,
      acceptedName: input.subjectAcceptedName,
      originalNames: [input.subjectOriginalName],
    }
    this.nodes.set(node.nodeId, node)
    return node
  }

  /**
   * Idempotently upsert a scientific edge. Reapplying the same claim updates the
   * timestamp and provenance in place; it never creates a second edge. Protected
   * content must never be admitted; callers pass eligible content only, and this
   * guard is a second line of defence.
   */
  upsertEdge(input: UpsertEdgeInput): UpsertEdgeOutcome {
    if (input.sensitivity === 'protected_locality') {
      throw new Error('Refusing to add protected-locality content to the knowledge graph')
    }
    const node = this.ensureNode(input)
    const key = this.edgeKey(input)
    const edgeId = `edge_${shortHash(key)}`
    const timestamp = this.now()

    const existing = this.edges.get(key)
    if (existing) {
      existing.updatedAt = timestamp
      existing.activation = input.activation
      existing.provenance = {
        claimId: input.claimId,
        sourceDocumentId: input.sourceDocumentId,
        supportingPassage: input.supportingPassage,
        passageSpan: input.passageSpan,
        contentHash: input.contentHash,
        taxonomyVersion: input.taxonomyVersion,
        extractorVersion: input.extractorVersion,
      }
      return { edge: existing, created: false }
    }

    const edge: GraphEdge = {
      edgeId,
      subjectNodeId: node.nodeId,
      predicate: input.predicate,
      object: input.object,
      activation: input.activation,
      provenance: {
        claimId: input.claimId,
        sourceDocumentId: input.sourceDocumentId,
        supportingPassage: input.supportingPassage,
        passageSpan: input.passageSpan,
        contentHash: input.contentHash,
        taxonomyVersion: input.taxonomyVersion,
        extractorVersion: input.extractorVersion,
      },
      sensitivity: input.sensitivity,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.edges.set(key, edge)
    return { edge, created: true }
  }

  nodeCount(): number {
    return this.nodes.size
  }

  edgeCount(): number {
    return this.edges.size
  }

  authoritativeEdges(): GraphEdge[] {
    return Array.from(this.edges.values()).filter((edge) => edge.activation === 'authoritative')
  }

  allEdges(): GraphEdge[] {
    return Array.from(this.edges.values())
  }

  /** Graph traversal: edges for a taxon, optionally restricted to authoritative. */
  edgesForTaxon(taxonId: string, activation?: GraphEdgeActivation): GraphEdge[] {
    return this.allEdges().filter(
      (edge) => edge.subjectNodeId === taxonId && (activation ? edge.activation === activation : true),
    )
  }
}
