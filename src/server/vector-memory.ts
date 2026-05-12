import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export type VectorMemoryConfig = {
  chromaBaseUrl: string
  embeddingServiceUrl: string
  embeddingModel: string
  collections: Record<string, string>
  dimension: number
  configPath: string
  fallbackEnabled: boolean
}

export type VectorCollectionStat = {
  key: string
  name: string
  id: string | null
  count: number | null
  error?: string
}

export type VectorDependencyStatus = {
  ok: boolean
  url: string
  error?: string
}

export type VectorMemoryStatus = {
  ok: boolean
  config: VectorMemoryConfig
  chroma: VectorDependencyStatus
  embeddings: VectorDependencyStatus
  collections: Array<VectorCollectionStat>
  totalRecords: number
  warnings: Array<string>
}

export type VectorSearchResult = {
  id: string
  collection: string
  document: string
  metadata: Record<string, unknown>
  distance: number | null
  score: number | null
}

export class VectorMemoryInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VectorMemoryInputError'
  }
}

type ChromaCollection = {
  id?: string
  name?: string
}

type ChromaQueryPayload = {
  ids?: Array<Array<string>>
  documents?: Array<Array<string | null>>
  metadatas?: Array<Array<Record<string, unknown> | null>>
  distances?: Array<Array<number | null>>
}

const DEFAULT_COLLECTIONS: Record<string, string> = {
  memories: 'agent_memories',
  sessions: 'session_history',
  team_knowledge: 'team_knowledge',
  team_ops: 'team_ops',
  agent_rilo: 'agent_rilo',
  agent_caddie: 'agent_caddie',
  agent_scout: 'agent_scout',
}

function hermesHome(): string {
  const envHome = (process.env.HERMES_HOME || process.env.CLAUDE_HOME)?.trim()
  return path.resolve(envHome || path.join(os.homedir(), '.hermes'))
}

function cleanBaseUrl(host: string, port: number): string {
  if (/^https?:\/\//i.test(host)) return host.replace(/\/$/, '')
  return `http://${host}:${port}`
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readCollections(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_COLLECTIONS }
  }
  const parsed: Record<string, string> = {}
  for (const [key, name] of Object.entries(value)) {
    if (typeof name === 'string' && name.trim()) parsed[key] = name.trim()
  }
  return Object.keys(parsed).length > 0 ? parsed : { ...DEFAULT_COLLECTIONS }
}

export function readVectorMemoryConfig(): VectorMemoryConfig {
  const home = hermesHome()
  const configPath = path.resolve(home, 'chromadb.json')
  const raw = readJsonFile(configPath) || {}
  const host = readString(raw.chromadb_host, '127.0.0.1')
  const port = readNumber(raw.chromadb_port, 8000)
  const embeddingServiceUrl = readString(
    raw.embedding_service_url,
    'http://127.0.0.1:8006',
  ).replace(/\/$/, '')
  const embeddingModel = readString(
    raw.embedding_model,
    'Qwen/Qwen3-Embedding-0.6B',
  )

  return {
    chromaBaseUrl: cleanBaseUrl(host, port),
    embeddingServiceUrl,
    embeddingModel,
    collections: readCollections(raw.collections),
    dimension: 1024,
    configPath,
    fallbackEnabled: readBoolean(raw.embedding_fallback_enabled, false),
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim())
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function checkJsonEndpoint(url: string): Promise<VectorDependencyStatus> {
  try {
    await fetchJson<unknown>(url)
    return { ok: true, url }
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function v2CollectionsUrl(config: VectorMemoryConfig): string {
  return `${config.chromaBaseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections`
}

function legacyCollectionsUrl(config: VectorMemoryConfig): string {
  return `${config.chromaBaseUrl}/api/v1/collections`
}

async function listChromaCollections(
  config: VectorMemoryConfig,
): Promise<Array<ChromaCollection>> {
  try {
    return await fetchJson<Array<ChromaCollection>>(v2CollectionsUrl(config))
  } catch {
    return fetchJson<Array<ChromaCollection>>(legacyCollectionsUrl(config))
  }
}

function collectionIdForName(
  collections: Array<ChromaCollection>,
  name: string,
): string | null {
  const found = collections.find((collection) => collection.name === name)
  return found?.id || found?.name || null
}

function parseCollectionCount(payload: unknown): number {
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof (payload as { count?: unknown }).count === 'number'
  ) {
    return (payload as { count: number }).count
  }
  return 0
}

async function countCollection(
  config: VectorMemoryConfig,
  idOrName: string,
): Promise<number> {
  try {
    const payload = await fetchJson<unknown>(
      `${v2CollectionsUrl(config)}/${encodeURIComponent(idOrName)}/count`,
    )
    return parseCollectionCount(payload)
  } catch {
    const payload = await fetchJson<unknown>(
      `${legacyCollectionsUrl(config)}/${encodeURIComponent(idOrName)}/count`,
    )
    return parseCollectionCount(payload)
  }
}

export async function getVectorMemoryStatus(): Promise<VectorMemoryStatus> {
  const config = readVectorMemoryConfig()
  const chroma = await checkJsonEndpoint(`${config.chromaBaseUrl}/api/v2/heartbeat`)
  const embeddings = await checkJsonEndpoint(`${config.embeddingServiceUrl}/health`)
  const warnings: Array<string> = []
  if (!config.embeddingModel.toLowerCase().includes('qwen3-embedding-0.6b')) {
    warnings.push(
      'Embedding model is not Qwen3-Embedding-0.6B; verify vector-space compatibility before writes.',
    )
  }
  if (config.dimension !== 1024) {
    warnings.push('Expected 1024-dimensional embeddings for current Hermes Chroma collections.')
  }

  const stats: Array<VectorCollectionStat> = []
  if (chroma.ok) {
    try {
      const chromaCollections = await listChromaCollections(config)
      for (const [key, name] of Object.entries(config.collections)) {
        const id = collectionIdForName(chromaCollections, name)
        if (!id) {
          stats.push({ key, name, id: null, count: null, error: 'Collection not found' })
          continue
        }
        try {
          stats.push({ key, name, id, count: await countCollection(config, id) })
        } catch (error) {
          stats.push({
            key,
            name,
            id,
            count: null,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error) {
      warnings.push(
        `Unable to list Chroma collections: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const totalRecords = stats.reduce((total, stat) => total + (stat.count || 0), 0)
  return {
    ok: chroma.ok && embeddings.ok,
    config,
    chroma,
    embeddings,
    collections: stats,
    totalRecords,
    warnings,
  }
}

async function embedQuery(config: VectorMemoryConfig, query: string): Promise<Array<number>> {
  const payload = await fetchJson<{
    embedding?: Array<number>
    embeddings?: Array<Array<number>>
    data?: Array<{ embedding?: Array<number> }>
  }>(`${config.embeddingServiceUrl}/embed-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: query }),
  })
  const embedding = payload.embedding || payload.embeddings?.[0] || payload.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding service did not return an embedding vector')
  }
  return embedding
}

export function normalizeVectorSearchResults(
  collection: string,
  payload: ChromaQueryPayload,
): Array<VectorSearchResult> {
  const ids = payload.ids?.[0] || []
  const documents = payload.documents?.[0] || []
  const metadatas = payload.metadatas?.[0] || []
  const distances = payload.distances?.[0] || []
  return ids.map((id, index) => {
    const distance = typeof distances[index] === 'number' ? distances[index] : null
    const score = distance == null ? null : 1 / (1 + Math.max(0, distance))
    return {
      id,
      collection,
      document: documents[index] || '',
      metadata: metadatas[index] || {},
      distance,
      score,
    }
  })
}

async function queryCollection(
  config: VectorMemoryConfig,
  collection: VectorCollectionStat,
  embedding: Array<number>,
  limit: number,
): Promise<Array<VectorSearchResult>> {
  const idOrName = collection.id || collection.name
  const body = JSON.stringify({
    query_embeddings: [embedding],
    n_results: limit,
    include: ['documents', 'metadatas', 'distances'],
  })
  try {
    const payload = await fetchJson<ChromaQueryPayload>(
      `${v2CollectionsUrl(config)}/${encodeURIComponent(idOrName)}/query`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    )
    return normalizeVectorSearchResults(collection.name, payload)
  } catch {
    const payload = await fetchJson<ChromaQueryPayload>(
      `${legacyCollectionsUrl(config)}/${encodeURIComponent(idOrName)}/query`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    )
    return normalizeVectorSearchResults(collection.name, payload)
  }
}

export async function searchVectorMemory(options: {
  query: string
  collection?: string
  limit?: number
}): Promise<{ results: Array<VectorSearchResult>; status: VectorMemoryStatus }> {
  const query = options.query.trim()
  if (!query) throw new VectorMemoryInputError('Query is required')
  if (query.length > 1000) {
    throw new VectorMemoryInputError('Query must be 1000 characters or fewer')
  }
  const rawLimit = options.limit ?? 8
  if (!Number.isFinite(rawLimit) || !Number.isInteger(rawLimit)) {
    throw new VectorMemoryInputError('Limit must be an integer')
  }
  const limit = Math.max(1, Math.min(rawLimit, 25))
  const status = await getVectorMemoryStatus()
  if (!status.chroma.ok) throw new Error(status.chroma.error || 'ChromaDB is unavailable')
  if (!status.embeddings.ok) throw new Error(status.embeddings.error || 'Embedding service is unavailable')

  if (
    options.collection &&
    options.collection !== 'all' &&
    !status.collections.some(
      (collection) =>
        collection.name === options.collection || collection.key === options.collection,
    )
  ) {
    throw new VectorMemoryInputError(`Unknown collection: ${options.collection}`)
  }

  const selected = status.collections.filter((collection) => {
    if (!collection.id || collection.error) return false
    if (!options.collection || options.collection === 'all') return true
    return collection.name === options.collection || collection.key === options.collection
  })
  if (selected.length === 0) {
    throw new VectorMemoryInputError('No available Chroma collections match the request')
  }
  const embedding = await embedQuery(status.config, query)
  const perCollectionLimit = options.collection && options.collection !== 'all' ? limit : Math.min(limit, 5)
  const batches = await Promise.allSettled(
    selected.map((collection) => queryCollection(status.config, collection, embedding, perCollectionLimit)),
  )
  const failures = batches.filter((batch) => batch.status === 'rejected')
  if (failures.length === batches.length) {
    const reason = failures[0].reason
    throw new Error(
      reason instanceof Error
        ? reason.message
        : 'All Chroma collection queries failed',
    )
  }
  const results = batches.flatMap((batch) => (batch.status === 'fulfilled' ? batch.value : []))
  results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  return { results: results.slice(0, limit), status }
}
