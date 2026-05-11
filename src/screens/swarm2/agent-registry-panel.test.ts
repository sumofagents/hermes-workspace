import { describe, expect, it } from 'vitest'

import {
  AGENT_REGISTRY_SURFACE_COPY,
  buildAgentRegistryRows,
  summarizeAgentRegistryDiagnostics,
} from './agent-registry-panel'

describe('Swarm2 read-only agent registry UI helpers', () => {
  it('builds rows with source-derived and read-only badges plus disabled action explanations', () => {
    const rows = buildAgentRegistryRows({
      entries: [
        {
          id: 'swarm5',
          displayName: 'Builder',
          role: 'Primary Builder',
          model: 'GPT-5.5',
          capabilities: ['code-editing'],
          skills: ['swarm-ui-worker'],
          dispatchEnabled: false,
          source: 'swarm.yaml',
          sourceDerived: true,
          writable: false,
          disabledActions: ['Registry is read-only in Phase 1.', 'Dispatch is disabled from registry rows.'],
        },
      ],
      diagnostics: [],
      backend: {
        kind: 'swarm-yaml',
        sourcePath: '/repo/swarm.yaml',
        compatibilityMode: true,
        writable: false,
        parserVersion: 'agent-registry-v1',
        loadedAt: 10,
        fetchedAt: 11,
      },
    })

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'swarm5',
        title: 'Builder',
        subtitle: 'Primary Builder · GPT-5.5',
        badges: ['source-derived', 'compatibility', 'read-only', 'dispatch-disabled'],
        detailLines: expect.arrayContaining([
          'Source: swarm.yaml (/repo/swarm.yaml)',
          'Capabilities: code-editing',
          'Skills: swarm-ui-worker',
          'Registry is read-only in Phase 1.',
        ]),
      }),
    ])
  })

  it('summarizes validation diagnostics without implying live runtime truth or edit capability', () => {
    expect(AGENT_REGISTRY_SURFACE_COPY).toContain('source-derived')
    expect(AGENT_REGISTRY_SURFACE_COPY).toContain('not live runtime truth')
    expect(AGENT_REGISTRY_SURFACE_COPY).toContain('read-only')

    const summary = summarizeAgentRegistryDiagnostics([
      { severity: 'error', code: 'missing_required', message: 'workers[0].id is required', path: 'workers[0].id' },
      { severity: 'warning', code: 'unknown_field', message: 'unknown field', path: 'workers[1].foo', entryId: 'swarm6' },
    ])

    expect(summary).toEqual({ errorCount: 1, warningCount: 1, infoCount: 0, state: 'invalid' })
  })
})
