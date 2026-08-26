// @vitest-environment jsdom
import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import RagEvidenceView from './RagEvidenceView'
import {
  createPipeline,
  ingestAndProcess,
  answerQuestion,
  buildEvidenceView,
  PHALAENOPSIS_PUBLICATION,
  DEMO_QUESTION,
} from '@/lib/scientific-intelligence/rag'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function seededView() {
  let tick = 0
  const state = createPipeline({ now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() })
  ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
  const query = answerQuestion(state, DEMO_QUESTION, 'query-1')
  return buildEvidenceView({ answer: query.answer, verification: query.verification, evidence: query.evidence })
}

describe('RagEvidenceView', () => {
  it('renders verified state, observed/inferred statements, and provenance', () => {
    const view = seededView()
    act(() => root.render(<RagEvidenceView view={view} />))
    const html = container.innerHTML

    expect(container.querySelector('[data-testid="rag-evidence-view"]')).toBeTruthy()
    // Answer state badge present.
    expect(container.querySelector('[data-testid="state-verified"]')).toBeTruthy()
    // Statements and evidence rows rendered.
    expect(container.querySelectorAll('[data-testid="statement"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-testid="evidence-row"]').length).toBeGreaterThan(0)
    // Original published name is preserved somewhere in the surface.
    expect(html).toContain('Phalaenopsis')
    // No protected coordinates ever reach the DOM.
    expect(html).not.toContain('114.7550')
  })

  it('shows a blocked notice with reasons when verification blocks', () => {
    const view = seededView()
    const blocked = {
      ...view,
      answerState: 'blocked' as const,
      answerStateLabel: 'Blocked',
      blockedReasons: ['an unsupported numeric value was asserted'],
    }
    act(() => root.render(<RagEvidenceView view={blocked} />))
    expect(container.querySelector('[data-testid="blocked-notice"]')).toBeTruthy()
    expect(container.innerHTML).toContain('unsupported numeric value')
  })
})
