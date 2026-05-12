import { HugeiconsIcon } from '@hugeicons/react'
import { BrainIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type VectorCollectionStat = {
  key: string
  name: string
  id: string | null
  count: number | null
  error?: string
}

type VectorDependencyStatus = {
  ok: boolean
  url: string
  error?: string
}

type VectorMemoryConfig = {
  chromaBaseUrl: string
  embeddingServiceUrl: string
  embeddingModel: string
  dimension: number
  configPath: string
  fallbackEnabled: boolean
}

type VectorMemoryStatus = {
  ok: boolean
  config: VectorMemoryConfig
  chroma: VectorDependencyStatus
  embeddings: VectorDependencyStatus
  collections: Array<VectorCollectionStat>
  totalRecords: number
  warnings: Array<string>
}

type VectorSearchResult = {
  id: string
  collection: string
  document: string
  metadata: Record<string, unknown>
  distance: number | null
  score: number | null
}

type SearchPayload = {
  results: Array<VectorSearchResult>
  status: VectorMemoryStatus
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`,
    )
  }
  return payload as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`,
    )
  }
  return payload as T
}

function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number') return '—'
  return new Intl.NumberFormat().format(value)
}

function formatScore(value: number | null): string {
  if (typeof value !== 'number') return '—'
  return `${Math.round(value * 100)}%`
}

function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2',
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 truncate text-sm">{ok ? 'Healthy' : detail || 'Unavailable'}</div>
    </div>
  )
}

export function VectorMemoryScreen() {
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('all')
  const [selected, setSelected] = useState<VectorSearchResult | null>(null)

  const statusQuery = useQuery({
    queryKey: ['vector-memory', 'status'],
    queryFn: () => readJson<VectorMemoryStatus>('/api/vector-memory/status'),
  })

  const searchMutation = useMutation({
    mutationFn: () =>
      postJson<SearchPayload>('/api/vector-memory/search', {
        query,
        collection,
        limit: 12,
      }),
    onSuccess: (payload) => {
      setSelected(payload.results[0] || null)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Vector search failed', {
        type: 'warning',
      })
    },
  })

  const status = searchMutation.data?.status || statusQuery.data
  const collections = status?.collections ?? []
  const results = searchMutation.data?.results ?? []
  const metadataEntries = useMemo(
    () => Object.entries(selected?.metadata || {}),
    [selected],
  )

  function runSearch() {
    if (!query.trim()) return
    searchMutation.mutate()
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
    >
      <div className="border-b border-primary-200 px-3 py-3 dark:border-neutral-800 md:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-9 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-900">
              <HugeiconsIcon icon={BrainIcon} size={18} strokeWidth={1.6} />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                Vector Memory
              </div>
              <div className="text-xs text-primary-500 dark:text-neutral-400">
                Embedding-backed semantic memory across Chroma collections.
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
            <div className="relative min-w-0 flex-1 lg:max-w-xl">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-400 dark:text-neutral-500"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runSearch()
                }}
                placeholder="Semantic search vector memory"
                className="w-full rounded-xl border border-primary-200 bg-primary-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-500 dark:border-neutral-800 dark:bg-neutral-950"
              />
            </div>
            <select
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
              className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <option value="all">All collections</option>
              {collections.map((item) => (
                <option key={item.key} value={item.name}>
                  {item.key}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runSearch}
              disabled={!query.trim() || searchMutation.isPending}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searchMutation.isPending ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 md:grid-cols-3 md:p-4 xl:grid-cols-4">
        <section className="space-y-3 md:col-span-1 xl:col-span-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
            <StatusPill
              label="ChromaDB"
              ok={Boolean(status?.chroma.ok)}
              detail={status?.chroma.error}
            />
            <StatusPill
              label="Embeddings"
              ok={Boolean(status?.embeddings.ok)}
              detail={status?.embeddings.error}
            />
          </div>

          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
              Module
            </div>
            {statusQuery.isLoading ? (
              <div className="mt-2 text-sm text-primary-500 dark:text-neutral-400">Loading status...</div>
            ) : status ? (
              <div className="mt-2 space-y-2 text-xs text-primary-600 dark:text-neutral-300">
                <div>Model: {status.config.embeddingModel}</div>
                <div>Dimension: {status.config.dimension}</div>
                <div>Total records: {formatCount(status.totalRecords)}</div>
                <div className="truncate">Chroma: {status.config.chromaBaseUrl}</div>
                <div className="truncate">Embeddings: {status.config.embeddingServiceUrl}</div>
                <div className="truncate">Config: {status.config.configPath}</div>
                {status.warnings.map((warning) => (
                  <div key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                    {warning}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-amber-600 dark:text-amber-300">
                {statusQuery.error instanceof Error
                  ? statusQuery.error.message
                  : 'Unable to load status'}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
                Collections
              </div>
              <button
                type="button"
                onClick={() => statusQuery.refetch()}
                className="text-xs text-accent-600 hover:underline"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-1.5">
              {collections.length === 0 ? (
                <div className="rounded-lg border border-primary-200 px-3 py-2 text-xs text-primary-500 dark:border-neutral-800 dark:text-neutral-400">
                  No collection stats yet.
                </div>
              ) : (
                collections.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCollection(item.name)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-xs',
                      collection === item.name
                        ? 'border-accent-500 bg-accent-500/10'
                        : 'border-primary-200 hover:border-primary-300 dark:border-neutral-800 dark:hover:border-neutral-700',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-primary-900 dark:text-neutral-100">
                        {item.key}
                      </span>
                      <span className="text-primary-500 dark:text-neutral-400">
                        {formatCount(item.count)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-primary-500 dark:text-neutral-500">
                      {item.error || item.name}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
              Read-only phase
            </div>
            <div className="mt-1 text-xs text-primary-500 dark:text-neutral-400">
              This dashboard can inspect Chroma status and run semantic searches. Vector writes, promotion, and authority decisions stay disabled here; source repositories and GitHub artifacts remain the evidence authority.
            </div>
          </div>
        </section>

        <section className="min-h-[360px] rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950 md:col-span-2 xl:col-span-2">
          <div className="border-b border-primary-200 px-3 py-2 dark:border-neutral-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
              Semantic Results ({results.length})
            </div>
          </div>
          <div className="max-h-[680px] space-y-2 overflow-y-auto p-3">
            {results.length === 0 ? (
              <div className="rounded-xl border border-primary-200 bg-primary-100/60 p-4 text-sm text-primary-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
                Search for a concept to inspect related embedded memories.
              </div>
            ) : (
              results.map((result) => (
                <button
                  key={`${result.collection}:${result.id}`}
                  type="button"
                  onClick={() => setSelected(result)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left',
                    selected?.id === result.id && selected.collection === result.collection
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-primary-200 hover:border-primary-300 dark:border-neutral-800 dark:hover:border-neutral-700',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-primary-500 dark:text-neutral-400">
                    <span className="truncate">{result.collection}</span>
                    <span>{formatScore(result.score)}</span>
                  </div>
                  <div className="line-clamp-3 text-sm text-primary-900 dark:text-neutral-100">
                    {result.document || '(empty document)'}
                  </div>
                  <div className="mt-2 truncate font-mono text-[11px] text-primary-400 dark:text-neutral-500">
                    {result.id}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950 md:col-span-3 xl:col-span-1">
          <div className="border-b border-primary-200 px-3 py-2 dark:border-neutral-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
              Inspector
            </div>
          </div>
          <div className="space-y-3 p-3 text-sm">
            {selected ? (
              <>
                <div>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">Collection</div>
                  <div className="break-all font-mono text-xs">{selected.collection}</div>
                </div>
                <div>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">ID</div>
                  <div className="break-all font-mono text-xs">{selected.id}</div>
                </div>
                <div>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">Score / distance</div>
                  <div>{formatScore(selected.score)} / {selected.distance ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">Document</div>
                  <div className="mt-1 whitespace-pre-wrap rounded-xl border border-primary-200 bg-primary-100/60 p-3 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900/60">
                    {selected.document || '(empty document)'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">Metadata</div>
                  <div className="mt-1 space-y-1">
                    {metadataEntries.length === 0 ? (
                      <div className="text-xs text-primary-400 dark:text-neutral-500">No metadata</div>
                    ) : (
                      metadataEntries.map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-primary-200 p-2 text-xs dark:border-neutral-800">
                          <div className="font-mono text-primary-500 dark:text-neutral-400">{key}</div>
                          <div className="mt-0.5 break-words">{String(value)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-primary-500 dark:text-neutral-400">
                Select a search result to inspect its text, metadata, id, and score.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
