import { beforeEach, describe, expect, it, vi } from 'vitest'

const { existsSync, readFileSync } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync },
  existsSync,
  readFileSync,
}))

const { homedir } = vi.hoisted(() => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

vi.mock('node:os', () => ({
  default: { homedir },
  homedir,
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_HOME
})

async function loadMod() {
  vi.resetModules()
  return import('./vector-memory')
}

describe('vector-memory server helpers', () => {
  it('loads chromadb.json from HERMES_HOME and exposes safe defaults', async () => {
    process.env.HERMES_HOME = '/custom/hermes'
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue(
      JSON.stringify({
        chromadb_host: '100.107.68.104',
        chromadb_port: 8000,
        embedding_service_url: 'http://100.113.1.2:8006',
        embedding_model: 'Qwen/Qwen3-Embedding-0.6B',
        collections: {
          memories: 'agent_memories',
          sessions: 'session_history',
        },
      }),
    )

    const mod = await loadMod()
    const config = mod.readVectorMemoryConfig()

    expect(readFileSync).toHaveBeenCalledWith(
      '/custom/hermes/chromadb.json',
      'utf-8',
    )
    expect(config.chromaBaseUrl).toBe('http://100.107.68.104:8000')
    expect(config.embeddingServiceUrl).toBe('http://100.113.1.2:8006')
    expect(config.embeddingModel).toBe('Qwen/Qwen3-Embedding-0.6B')
    expect(config.collections).toEqual({
      memories: 'agent_memories',
      sessions: 'session_history',
    })
    expect(config.dimension).toBe(1024)
  })

  it('normalizes Chroma query results into dashboard records', async () => {
    const mod = await loadMod()

    const results = mod.normalizeVectorSearchResults('team_knowledge', {
      ids: [['abc123']],
      documents: [['Memory text']],
      metadatas: [[{ source: 'test', importance: 0.8 }]],
      distances: [[0.14]],
    })

    expect(results).toEqual([
      {
        id: 'abc123',
        collection: 'team_knowledge',
        document: 'Memory text',
        metadata: { source: 'test', importance: 0.8 },
        distance: 0.14,
        score: 0.8771929824561403,
      },
    ])
  })

  it('rejects unsafe search inputs before touching live services', async () => {
    const mod = await loadMod()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      mod.searchVectorMemory({ query: '   ', collection: 'all', limit: 8 }),
    ).rejects.toThrow(mod.VectorMemoryInputError)
    await expect(
      mod.searchVectorMemory({ query: 'ok', collection: 'all', limit: 1.5 }),
    ).rejects.toThrow('Limit must be an integer')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not expose dashboard write helpers in the read-only vector-memory module', async () => {
    const mod = await loadMod()

    expect('storeTeamDiscovery' in mod).toBe(false)
  })

  it('queries Forge with the live embed-single contract before Chroma query', async () => {
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue(
      JSON.stringify({
        chromadb_host: '127.0.0.1',
        chromadb_port: 8000,
        embedding_service_url: 'http://forge.local:8006',
        embedding_model: 'Qwen/Qwen3-Embedding-0.6B',
        collections: { team_knowledge: 'team_knowledge' },
      }),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ heartbeat: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'col-1', name: 'team_knowledge' }]),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(7) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.1, 0.2], dimensions: 1024 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ids: [['abc123']],
            documents: [['Memory text']],
            metadatas: [[{}]],
            distances: [[0.2]],
          }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const mod = await loadMod()
    const payload = await mod.searchVectorMemory({
      query: 'memory module',
      collection: 'team_knowledge',
      limit: 3,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://forge.local:8006/embed-single',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'memory module' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://127.0.0.1:8000/api/v2/tenants/default_tenant/databases/default_database/collections/col-1/query',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query_embeddings: [[0.1, 0.2]],
          n_results: 3,
          include: ['documents', 'metadatas', 'distances'],
        }),
      }),
    )
    expect(payload.results).toHaveLength(1)
  })
})
