import { describe, expect, it, vi } from 'vitest'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(() => true),
}))

import { buildAgentRegistryApiPayload, READ_ONLY_AGENT_REGISTRY_METHODS } from '../../server/agent-registry'
import { Route as AgentRegistryRoute } from './agent-registry'

describe('read-only agent registry API payload', () => {
  it('returns normalized entries, backend metadata, diagnostics, and timestamps from a read-only loader', () => {
    const payload = buildAgentRegistryApiPayload({
      ok: true,
      parserVersion: 'agent-registry-v1',
      entries: [
        {
          id: 'swarm5',
          displayName: 'Builder',
          role: 'Builder',
          dispatchEnabled: false,
          source: 'swarm.yaml',
          sourceDerived: true,
          writable: false,
          capabilities: [],
          skills: [],
          disabledActions: ['Registry is read-only in Phase 1.'],
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

    expect(payload).toMatchObject({
      ok: true,
      registry: { entries: [{ id: 'swarm5', dispatchEnabled: false, writable: false }] },
      backend: { sourcePath: '/repo/swarm.yaml', writable: false, parserVersion: 'agent-registry-v1' },
      diagnostics: [],
      fetchedAt: 11,
      loadedAt: 10,
    })
  })

  it('documents that only GET and HEAD are valid read methods', () => {
    expect(READ_ONLY_AGENT_REGISTRY_METHODS).toEqual(['GET', 'HEAD'])
  })

  it('does not register mutating route handlers', () => {
    const handlers = AgentRegistryRoute.options.server?.handlers as Record<string, unknown>

    expect(Object.keys(handlers).sort()).toEqual(['GET', 'HEAD'])
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(handlers[method]).toBeUndefined()
    }
  })
})
