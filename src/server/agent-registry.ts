import { existsSync, readFileSync } from 'node:fs'
import * as yaml from 'yaml'
import { z } from 'zod'
import { SWARM_ROSTER_PATH } from './swarm-roster'

export const AGENT_REGISTRY_PARSER_VERSION = 'agent-registry-v1'
export const READ_ONLY_AGENT_REGISTRY_METHODS = ['GET', 'HEAD'] as const

type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type AgentRegistryDiagnostic = {
  severity: DiagnosticSeverity
  code: string
  message: string
  path?: string
  entryId?: string
}

export type AgentRegistryEntry = {
  id: string
  displayName: string
  role: string
  specialty?: string
  model?: string
  mission?: string
  capabilities: Array<string>
  skills: Array<string>
  preferredTaskTypes?: Array<string>
  maxConcurrentTasks?: number
  acceptsBroadcast?: boolean
  reviewRequired?: boolean
  dispatchEnabled: boolean
  source: 'swarm.yaml'
  sourceDerived: boolean
  writable: boolean
  disabledActions: Array<string>
}

export type AgentRegistryBackendMetadata = {
  kind: 'swarm-yaml'
  compatibilityMode: boolean
  sourcePath: string
  writable: boolean
  loadedAt: number
  fetchedAt?: number
  parserVersion: string
}

export type AgentRegistryResult = {
  ok: boolean
  parserVersion: string
  entries: Array<AgentRegistryEntry>
  diagnostics: Array<AgentRegistryDiagnostic>
  backend: AgentRegistryBackendMetadata
}

export type AgentRegistryApiPayload = {
  ok: boolean
  registry: { entries: Array<AgentRegistryEntry> }
  backend: AgentRegistryBackendMetadata
  diagnostics: Array<AgentRegistryDiagnostic>
  fetchedAt?: number
  loadedAt: number
  parserVersion: string
}

const WORKER_ID_PATTERN = /^swarm\d+$/
const WorkerSchema = z.object({
  id: z.string().min(1).regex(WORKER_ID_PATTERN),
  name: z.string().min(1),
  role: z.string().min(1),
  specialty: z.string().optional(),
  model: z.string().optional(),
  mission: z.string().optional(),
  skills: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  defaultCwd: z.string().optional(),
  preferredTaskTypes: z.array(z.string()).optional(),
  maxConcurrentTasks: z.number().int().positive().optional(),
  acceptsBroadcast: z.boolean().optional(),
  reviewRequired: z.boolean().optional(),
  dispatch_enabled: z.boolean().optional(),
  dispatchAuthorization: z.object({ readOnlyRegistry: z.boolean().optional() }).optional(),
})

const TOP_LEVEL_KEYS = new Set(['version', 'workers'])
const WORKER_KEYS = new Set(Object.keys(WorkerSchema.shape))

function backend(sourcePath: string, loadedAt = Date.now(), fetchedAt?: number): AgentRegistryBackendMetadata {
  return {
    kind: 'swarm-yaml',
    compatibilityMode: true,
    sourcePath,
    writable: false,
    loadedAt,
    fetchedAt,
    parserVersion: AGENT_REGISTRY_PARSER_VERSION,
  }
}

function diagnostic(
  severity: DiagnosticSeverity,
  code: string,
  message: string,
  path?: string,
  entryId?: string,
): AgentRegistryDiagnostic {
  return { severity, code, message, path, entryId }
}

function hasError(diagnostics: Array<AgentRegistryDiagnostic>): boolean {
  return diagnostics.some((item) => item.severity === 'error')
}

function maybeSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /(?:sk-[a-z0-9._-]{6,}|(?:sk|pk|rk)_[a-z0-9._-]{6,}|github_pat_[a-z0-9._-]{10,}|gh[pousr]_[a-z0-9._-]{6,}|xox[baprs]-[a-z0-9.-]{6,}|AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}|api[_-]?key|secret|bearer\s+[a-z0-9._~+/=-]{12,}|token\s+[a-z0-9._~+/=-]{8,}|password\s*[:=]|(?:AKIA|ASIA)[0-9A-Z.]{8,}|[A-Za-z0-9+/=_-]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value)
}

function maybeSecretKey(value: unknown): boolean {
  if (maybeSecret(value)) return true
  if (typeof value !== 'string') return false
  return /(?:password|passwd|pwd|token|secret|credential|authorization|bearer|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)/i.test(value)
}

function diagnosticEntryId(value: string | undefined): string | undefined {
  if (!value || !WORKER_ID_PATTERN.test(value) || maybeSecret(value) || maybeSecretKey(value)) return undefined
  return value
}

function diagnosticKey(key: string): string {
  return maybeSecretKey(key) ? '<redacted_key>' : key
}

function diagnosticPath(path: string, key: string): string {
  const safeKey = diagnosticKey(key)
  return path ? `${path}.${safeKey}` : safeKey
}

function scanSecrets(value: unknown, path: string, diagnostics: Array<AgentRegistryDiagnostic>, entryId?: string): boolean {
  let found = false
  if (maybeSecret(value)) {
    diagnostics.push(diagnostic('error', 'secret_like_value', `Secret-looking value is not allowed at ${path}`, path, entryId))
    return true
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      found = scanSecrets(item, `${path}[${index}]`, diagnostics, entryId) || found
    })
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      const nextPath = diagnosticPath(path, key)
      if (maybeSecretKey(key)) {
        diagnostics.push(diagnostic('error', 'secret_like_value', `Secret-looking key is not allowed at ${nextPath}`, nextPath, entryId))
        found = true
      }
      found = scanSecrets(item, nextPath, diagnostics, entryId) || found
    }
  }
  return found
}

function scanTopLevelSecrets(root: Record<string, unknown>, diagnostics: Array<AgentRegistryDiagnostic>): boolean {
  let found = false
  for (const [key, value] of Object.entries(root)) {
    if (key === 'workers') continue
    const safePath = diagnosticKey(key)
    if (maybeSecretKey(key)) {
      diagnostics.push(diagnostic('error', 'secret_like_value', `Secret-looking key is not allowed at ${safePath}`, safePath))
      found = true
    }
    found = scanSecrets(value, safePath, diagnostics) || found
  }
  return found
}

function disabledActions(dispatchEnabled: boolean): Array<string> {
  return [
    'Registry is read-only in Phase 1.',
    dispatchEnabled
      ? 'Dispatch remains disabled from registry rows; authorization is metadata-only in Phase 1.'
      : 'Dispatch is disabled from registry rows.',
    'Edits and source sync are not available from the read-only registry.',
  ]
}

function normalizeWorker(worker: z.infer<typeof WorkerSchema>): AgentRegistryEntry {
  return {
    id: worker.id,
    displayName: worker.name,
    role: worker.role,
    specialty: worker.specialty,
    model: worker.model,
    mission: worker.mission,
    capabilities: worker.capabilities ?? [],
    skills: worker.skills ?? [],
    preferredTaskTypes: worker.preferredTaskTypes,
    maxConcurrentTasks: worker.maxConcurrentTasks,
    acceptsBroadcast: worker.acceptsBroadcast,
    reviewRequired: worker.reviewRequired,
    dispatchEnabled: false,
    source: 'swarm.yaml',
    sourceDerived: true,
    writable: false,
    disabledActions: disabledActions(false),
  }
}

export function parseAgentRegistryDocument(
  text: string,
  options: { sourcePath: string; loadedAt?: number } = { sourcePath: SWARM_ROSTER_PATH },
): AgentRegistryResult {
  const loadedAt = options.loadedAt ?? Date.now()
  const diagnostics: Array<AgentRegistryDiagnostic> = []
  const resultBackend = backend(options.sourcePath, loadedAt)
  let doc: unknown

  try {
    doc = yaml.parse(text) as unknown
  } catch (error) {
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics: [
        diagnostic(
          'error',
          'parse_error',
          'Failed to parse registry YAML',
        ),
      ],
      backend: resultBackend,
    }
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics: [diagnostic('error', 'invalid_document', 'Registry document must be an object')],
      backend: resultBackend,
    }
  }

  const root = doc as Record<string, unknown>
  for (const key of Object.keys(root)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      const safeKey = diagnosticKey(key)
      diagnostics.push(diagnostic('error', 'unknown_field', `Unknown top-level field ${safeKey}`, safeKey))
    }
  }

  const documentHasTopLevelSecret = scanTopLevelSecrets(root, diagnostics)
  if (documentHasTopLevelSecret) {
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics,
      backend: resultBackend,
    }
  }

  if (root.version !== 1) {
    diagnostics.push(
      diagnostic('error', 'schema_version_unsupported', 'Only swarm.yaml version 1 is supported', 'version'),
    )
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics,
      backend: resultBackend,
    }
  }

  if (!Array.isArray(root.workers)) {
    diagnostics.push(diagnostic('error', 'missing_required', 'workers must be an array', 'workers'))
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics,
      backend: resultBackend,
    }
  }

  if (root.workers.length === 0) {
    diagnostics.push(diagnostic('info', 'empty_registry', 'Registry contains no workers', 'workers'))
  }

  const seen = new Set<string>()
  const entries: Array<AgentRegistryEntry> = []

  root.workers.forEach((rawWorker, index) => {
    const path = `workers[${index}]`
    if (!rawWorker || typeof rawWorker !== 'object' || Array.isArray(rawWorker)) {
      diagnostics.push(diagnostic('error', 'invalid_worker', 'Worker entry must be an object', path))
      return
    }

    const workerRecord = rawWorker as Record<string, unknown>
    const rawId = typeof workerRecord.id === 'string' ? workerRecord.id : undefined
    const diagnosticId = diagnosticEntryId(rawId)
    for (const key of Object.keys(workerRecord)) {
      if (!WORKER_KEYS.has(key)) {
        const safeKey = diagnosticKey(key)
        diagnostics.push(diagnostic('error', 'unknown_field', `Unknown worker field ${safeKey}`, diagnosticPath(path, key), diagnosticId))
      }
    }

    for (const required of ['id', 'name', 'role']) {
      if (typeof workerRecord[required] !== 'string' || !(workerRecord[required] as string).trim()) {
        diagnostics.push(
          diagnostic('error', 'missing_required', `${path}.${required} is required`, `${path}.${required}`, diagnosticId),
        )
      }
    }

    const foundSecret = scanSecrets(workerRecord, path, diagnostics, diagnosticId)
    if (foundSecret) return

    const parsed = WorkerSchema.safeParse(workerRecord)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const issuePath = `${path}.${issue.path.join('.')}`.replace(/\.$/, '')
        const code = issue.path.join('.') === 'id' ? 'invalid_worker_id' : 'invalid_field'
        diagnostics.push(diagnostic('error', code, issue.message, issuePath, diagnosticId))
      }
      return
    }

    if (seen.has(parsed.data.id)) {
      diagnostics.push(diagnostic('error', 'duplicate_id', `Duplicate worker id ${parsed.data.id}`, `${path}.id`, parsed.data.id))
      return
    }
    seen.add(parsed.data.id)

    const entry = normalizeWorker(parsed.data)
    if (parsed.data.dispatch_enabled === true) {
      if (parsed.data.dispatchAuthorization?.readOnlyRegistry === true) {
        entry.disabledActions = disabledActions(true)
      } else {
        diagnostics.push(
          diagnostic(
            'error',
            'dispatch_enabled_not_authorized',
            'dispatch_enabled=true requires explicit read-only registry authorization metadata and remains disabled in Phase 1',
            `${path}.dispatch_enabled`,
            parsed.data.id,
          ),
        )
      }
    }
    entries.push(entry)
  })

  return {
    ok: !hasError(diagnostics),
    parserVersion: AGENT_REGISTRY_PARSER_VERSION,
    entries,
    diagnostics,
    backend: resultBackend,
  }
}

export function loadAgentRegistry(options: { sourcePath?: string; now?: () => number } = {}): AgentRegistryResult {
  const sourcePath = options.sourcePath ?? SWARM_ROSTER_PATH
  const now = options.now ?? Date.now
  const timestamp = now()
  if (!existsSync(sourcePath)) {
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics: [diagnostic('error', 'source_missing', `Registry source does not exist: ${sourcePath}`, 'sourcePath')],
      backend: backend(sourcePath, timestamp, timestamp),
    }
  }
  let sourceText: string
  try {
    sourceText = readFileSync(sourcePath, 'utf8')
  } catch (error) {
    return {
      ok: false,
      parserVersion: AGENT_REGISTRY_PARSER_VERSION,
      entries: [],
      diagnostics: [
        diagnostic(
          'error',
          'source_unreadable',
          error instanceof Error ? error.message : `Registry source could not be read: ${sourcePath}`,
          'sourcePath',
        ),
      ],
      backend: backend(sourcePath, timestamp, timestamp),
    }
  }
  const parsed = parseAgentRegistryDocument(sourceText, { sourcePath, loadedAt: timestamp })
  return {
    ...parsed,
    backend: {
      ...parsed.backend,
      fetchedAt: timestamp,
    },
  }
}

export function buildAgentRegistryApiPayload(result: AgentRegistryResult): AgentRegistryApiPayload {
  return {
    ok: result.ok,
    registry: { entries: result.entries },
    backend: result.backend,
    diagnostics: result.diagnostics,
    fetchedAt: result.backend.fetchedAt,
    loadedAt: result.backend.loadedAt,
    parserVersion: result.parserVersion,
  }
}
