import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  AGENT_REGISTRY_PARSER_VERSION,
  buildAgentRegistryApiPayload,
  loadAgentRegistry,
  parseAgentRegistryDocument,
} from './agent-registry'

function tempYaml(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-registry-'))
  const file = join(dir, 'swarm.yaml')
  writeFileSync(file, content, 'utf8')
  return file
}

describe('agent registry schema/parser', () => {
  it('normalizes valid swarm.yaml workers into read-only registry entries with backend metadata', () => {
    const result = parseAgentRegistryDocument(
      `version: 1
workers:
  - id: swarm5
    name: Builder
    role: Primary Builder
    specialty: full-stack implementation
    model: GPT-5.5
    mission: Ship focused slices.
    skills: [swarm-ui-worker]
    capabilities: [code-editing, ui-implementation]
    preferredTaskTypes: [implementation]
    maxConcurrentTasks: 1
    acceptsBroadcast: true
`,
      { sourcePath: '/repo/swarm.yaml', loadedAt: 1234 },
    )

    expect(result.ok).toBe(true)
    expect(result.parserVersion).toBe(AGENT_REGISTRY_PARSER_VERSION)
    expect(result.backend).toMatchObject({
      kind: 'swarm-yaml',
      compatibilityMode: true,
      sourcePath: '/repo/swarm.yaml',
      writable: false,
      loadedAt: 1234,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
    })
    expect(result.entries).toEqual([
      expect.objectContaining({
        id: 'swarm5',
        displayName: 'Builder',
        role: 'Primary Builder',
        model: 'GPT-5.5',
        dispatchEnabled: false,
        source: 'swarm.yaml',
        sourceDerived: true,
        writable: false,
        capabilities: ['code-editing', 'ui-implementation'],
        disabledActions: expect.arrayContaining([
          expect.stringContaining('read-only'),
          expect.stringContaining('Dispatch is disabled'),
        ]),
      }),
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('returns valid entries plus diagnostics for missing required fields, duplicate ids, and unknown fields', () => {
    const result = parseAgentRegistryDocument(
      `version: 1
workers:
  - id: swarm5
    name: Builder
    role: Primary Builder
    unexpected: nope
  - id: swarm5
    name: Duplicate
    role: Duplicate Role
  - name: Missing Id
    role: Broken
  - id: swarm6
    name: Reviewer
    role: Reviewer
`,
      { sourcePath: '/repo/swarm.yaml', loadedAt: 100 },
    )

    expect(result.ok).toBe(false)
    expect(result.entries.map((entry) => entry.id)).toEqual(['swarm5', 'swarm6'])
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: 'unknown_field', path: 'workers[0].unexpected', entryId: 'swarm5' }),
        expect.objectContaining({ severity: 'error', code: 'duplicate_id', path: 'workers[1].id', entryId: 'swarm5' }),
        expect.objectContaining({ severity: 'error', code: 'missing_required', path: 'workers[2].id' }),
      ]),
    )
  })

  it('fails closed for malformed YAML, schema-version mismatches, empty registries, and secret-looking values', () => {
    const malformed = parseAgentRegistryDocument('version: 1\nworkers: [', { sourcePath: '/repo/swarm.yaml' })
    expect(malformed.ok).toBe(false)
    expect(malformed.entries).toEqual([])
    expect(malformed.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'parse_error' }))

    const malformedSecret = parseAgentRegistryDocument('version: 1\nworkers: [sk-live-secret-token', { sourcePath: '/repo/swarm.yaml' })
    expect(malformedSecret.ok).toBe(false)
    expect(JSON.stringify(malformedSecret.diagnostics)).not.toContain('sk-live-secret-token')
    expect(malformedSecret.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'parse_error', message: 'Failed to parse registry YAML' }))

    const topLevelKeySecret = parseAgentRegistryDocument(`version: 1
sk-liv...oken: true
workers: []`)
    expect(topLevelKeySecret.ok).toBe(false)
    expect(topLevelKeySecret.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: '<redacted_key>' }))
    expect(JSON.stringify(topLevelKeySecret.diagnostics)).not.toContain('sk-liv...oken')

    const wrongVersion = parseAgentRegistryDocument(`version: 2
workers:
  - id: swarm9
    name: Wrong Version
    role: Should Not Load
`, { sourcePath: '/repo/swarm.yaml' })
    expect(wrongVersion.ok).toBe(false)
    expect(wrongVersion.entries).toEqual([])
    expect(wrongVersion.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'schema_version_unsupported' }))

    const empty = parseAgentRegistryDocument('version: 1\nworkers: []', { sourcePath: '/repo/swarm.yaml' })
    expect(empty.ok).toBe(true)
    expect(empty.entries).toEqual([])
    expect(empty.diagnostics).toContainEqual(expect.objectContaining({ severity: 'info', code: 'empty_registry' }))

    const topLevelSecret = parseAgentRegistryDocument(
      `version: 1
metadata: ASIAIOSFODNN7EXAMPLE
workers:
  - id: swarm12
    name: Valid Looking
    role: Ops
`,
      { sourcePath: '/repo/swarm.yaml' },
    )
    expect(topLevelSecret.ok).toBe(false)
    expect(topLevelSecret.entries).toEqual([])
    expect(topLevelSecret.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'unknown_field', path: 'metadata' }),
      expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'metadata' }),
    ]))

    const broaderSecret = parseAgentRegistryDocument(
      `version: 1
workers:
  - id: swarm7
    name: Scribe
    role: Docs
    mission: token sk-live-1234567890abcdef
`,
      { sourcePath: '/repo/swarm.yaml' },
    )
    expect(broaderSecret.ok).toBe(false)
    expect(broaderSecret.entries).toEqual([])
    expect(buildAgentRegistryApiPayload(broaderSecret).registry.entries).toEqual([])
    expect(JSON.stringify(broaderSecret.entries)).not.toContain('sk-liv')
    expect(broaderSecret.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[0].mission', entryId: 'swarm7' }))
  })

  it('rejects malformed worker ids before entries can merge into Swarm2 roster metadata', () => {
    const result = parseAgentRegistryDocument(
      `version: 1
workers:
  - id: ../../../etc/passwd
    name: Path Escape
    role: Bad Actor
  - id: swarm8
    name: Watch
    role: Ops
`,
      { sourcePath: '/repo/swarm.yaml' },
    )

    expect(result.ok).toBe(false)
    expect(result.entries.map((entry) => entry.id)).toEqual(['swarm8'])
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'invalid_worker_id', path: 'workers[0].id' }))
    expect(JSON.stringify(result.diagnostics)).not.toContain('../../../etc/passwd')
  })

  it('rejects broader secret-looking credential families and never echoes a secret-like id in diagnostics', () => {
    const result = parseAgentRegistryDocument(
      `version: 1
workers:
  - id: sk-live-secret-token
    name: Secret Id
    role: Docs
    sk-liv...oken: hidden
    mission: ordinary text
  - id: swarm9
    name: Bearer
    role: Ops
    mission: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI'
  - id: swarm10
    name: Aws
    role: Ops
    model: AKIAIOSFODNN7EXAMPLE
  - id: swarm11
    name: Pem
    role: Ops
    mission: '-----BEGIN PRIVATE KEY-----'
  - id: ghp_12...1234
    name: GitHub
    role: Ops
    mission: ordinary text
  - id: swarm12
    name: Slack
    role: Ops
    xoxb-1...cdef: hidden
    mission: ordinary text
  - id: swarm13
    name: Token
    role: Ops
    model: github_pat_1234567890abcdef
`,
      { sourcePath: '/repo/swarm.yaml' },
    )

    expect(result.ok).toBe(false)
    expect(result.entries).toEqual([])
    const serializedDiagnostics = JSON.stringify(result.diagnostics)
    expect(serializedDiagnostics).not.toContain('sk-liv...oken')
    expect(serializedDiagnostics).not.toContain('sk-live-secret-token')
    expect(serializedDiagnostics).not.toContain('ghp_12...1234')
    expect(serializedDiagnostics).not.toContain('xoxb-1...cdef')
    expect(serializedDiagnostics).not.toContain('github_pat_1234567890abcdef')

    const semanticTopLevelKey = parseAgentRegistryDocument(`version: 1
GITHUB_TOKEN: top-level
workers: []
`)
    const serializedTopLevelSemanticDiagnostics = JSON.stringify(semanticTopLevelKey.diagnostics)
    expect(semanticTopLevelKey.ok).toBe(false)
    expect(serializedTopLevelSemanticDiagnostics).not.toContain('GITHUB_TOKEN')
    expect(semanticTopLevelKey.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: '<redacted_key>' }))

    const semanticWorkerKeys = parseAgentRegistryDocument(`version: 1
workers:
  - id: swarm14
    name: Semantic
    role: Ops
    password: hidden
    access_token: hidden
    bearerToken: hidden
    authorization: hidden
    private_key: hidden
`)
    const serializedSemanticDiagnostics = JSON.stringify(semanticWorkerKeys.diagnostics)
    expect(semanticWorkerKeys.ok).toBe(false)
    expect(semanticWorkerKeys.entries).toEqual([])
    for (const rawKey of ['password', 'access_token', 'bearerToken', 'authorization', 'private_key']) {
      expect(serializedSemanticDiagnostics).not.toContain(rawKey)
    }
    expect(semanticWorkerKeys.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[0].<redacted_key>', entryId: 'swarm14' }))

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[0].id' }),
      expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[0].<redacted_key>' }),
      expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[1].mission', entryId: 'swarm9' }),
      expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[2].model', entryId: 'swarm10' }),
      expect.objectContaining({ severity: 'error', code: 'secret_like_value', path: 'workers[3].mission', entryId: 'swarm11' }),
    ]))
  })

  it('treats dispatch_enabled as fail-closed unless explicit read-only authorization metadata is present', () => {
    const unauthorized = parseAgentRegistryDocument(
      `version: 1
workers:
  - id: swarm5
    name: Builder
    role: Primary Builder
    dispatch_enabled: true
`,
      { sourcePath: '/repo/swarm.yaml' },
    )
    expect(unauthorized.ok).toBe(false)
    expect(unauthorized.entries[0]?.dispatchEnabled).toBe(false)
    expect(unauthorized.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'dispatch_enabled_not_authorized', entryId: 'swarm5' }))
  })
})

describe('loadAgentRegistry no-mutation boundary', () => {
  it('reads swarm.yaml without writing the source file or probing live systems', () => {
    const sourcePath = tempYaml(`version: 1
workers:
  - id: swarm8
    name: Watch
    role: Ops
`)
    const before = statSync(sourcePath).mtimeMs
    const result = loadAgentRegistry({ sourcePath, now: () => 42 })

    const after = statSync(sourcePath).mtimeMs
    expect(result.ok).toBe(true)
    expect(result.backend).toMatchObject({ writable: false, fetchedAt: 42, loadedAt: 42 })
    expect(readFileSync(sourcePath, 'utf8')).toContain('swarm8')
    expect(after).toBe(before)
  })

  it('returns a structured diagnostic when an existing source cannot be read', () => {
    const unreadableSource = mkdtempSync(join(tmpdir(), 'agent-registry-unreadable-'))
    const result = loadAgentRegistry({ sourcePath: unreadableSource, now: () => 77 })

    expect(result.ok).toBe(false)
    expect(result.entries).toEqual([])
    expect(result.backend).toMatchObject({ sourcePath: unreadableSource, writable: false, fetchedAt: 77, loadedAt: 77 })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'source_unreadable', path: 'sourcePath' }))
  })
})
