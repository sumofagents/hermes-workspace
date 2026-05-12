You are Claude Code/Max reviewing committed HEAD 31297bd9 for merge.
Read-only review only. Return exactly one verdict line: Verdict: APPROVED or Verdict: REQUEST_CHANGES, then concise findings.

Scope:
- Local portable sessions are listed when backend sessions capability is unavailable.
- /api/history returns local portable messages for requested local sessions in the same backend-unavailable mode.
- Vector memory dashboard remains read-only: discovery writes disabled, server write helper removed.
- Swarm2 read-only registry-only entries render as offline operational cards without registry mutation.

Controller verification:
- npm test -- --run src/routes/api/-history.test.ts src/routes/api/-sessions.test.ts src/server/vector-memory.test.ts src/screens/swarm2/swarm2-screen.test.ts => PASS, 23 tests
- git diff --check => PASS
- Codex GPT-5.5 final incremental review => APPROVED

Committed diff:
commit 31297bd9221cf8b5d4c1e15f84cff0ad53a4106b
Author: Jeremiah Thompson <26468297+jeremiahrthompson@users.noreply.github.com>
Date:   Tue May 12 11:24:56 2026 -0400

    feat: complete read-only agent registry phase
---
 src/routes/api/-history.test.ts             | 30 +++++++++++
 src/routes/api/-sessions.test.ts            | 37 +++++++++++++
 src/routes/api/history.ts                   | 62 ++++++++++++++--------
 src/routes/api/sessions.ts                  | 35 +++++++++---
 src/routes/api/vector-memory/discovery.ts   | 51 +++---------------
 src/screens/memory/vector-memory-screen.tsx | 53 +------------------
 src/screens/swarm2/swarm2-screen.test.ts    | 15 ++++--
 src/screens/swarm2/swarm2-screen.tsx        | 62 +++++++++++++++-------
 src/server/vector-memory.test.ts            | 60 +--------------------
 src/server/vector-memory.ts                 | 82 -----------------------------
 10 files changed, 201 insertions(+), 286 deletions(-)

diff --git a/src/routes/api/-history.test.ts b/src/routes/api/-history.test.ts
new file mode 100644
index 00000000..0594a4b8
--- /dev/null
+++ b/src/routes/api/-history.test.ts
@@ -0,0 +1,30 @@
+import { describe, expect, it } from 'vitest'
+import { buildLocalHistoryPayload } from './history'
+
+describe('GET /api/history local fallback payload', () => {
+  it('maps local portable session messages when backend sessions are unavailable', () => {
+    const payload = buildLocalHistoryPayload('local-1', [
+      {
+        id: 'msg-1',
+        role: 'user',
+        content: 'hello local model',
+        timestamp: 1234,
+      },
+    ])
+
+    expect(payload).toEqual({
+      sessionKey: 'local-1',
+      sessionId: 'local-1',
+      source: 'local',
+      messages: [
+        {
+          id: 'msg-1',
+          role: 'user',
+          content: [{ type: 'text', text: 'hello local model' }],
+          timestamp: 1234,
+          historyIndex: 0,
+        },
+      ],
+    })
+  })
+})
diff --git a/src/routes/api/-sessions.test.ts b/src/routes/api/-sessions.test.ts
new file mode 100644
index 00000000..a61d6254
--- /dev/null
+++ b/src/routes/api/-sessions.test.ts
@@ -0,0 +1,37 @@
+import { describe, expect, it } from 'vitest'
+import { buildUnavailableSessionsPayload } from './sessions'
+
+describe('GET /api/sessions fallback payload', () => {
+  it('returns local portable sessions when backend sessions capability is unavailable', () => {
+    const payload = buildUnavailableSessionsPayload([
+      {
+        id: 'local-1',
+        title: 'Recovered Workspace Chat',
+        model: 'hermes-agent',
+        createdAt: 1000,
+        updatedAt: 2000,
+        messageCount: 7,
+      },
+    ])
+
+    expect(payload).toMatchObject({
+      ok: true,
+      source: 'local',
+      sessions: [
+        {
+          key: 'local-1',
+          id: 'local-1',
+          friendlyId: 'local-1',
+          title: 'Recovered Workspace Chat',
+          label: 'Recovered Workspace Chat',
+          derivedTitle: 'Recovered Workspace Chat',
+          startedAt: 1000,
+          updatedAt: 2000,
+          message_count: 7,
+          model: 'hermes-agent',
+          source: 'local',
+        },
+      ],
+    })
+  })
+})
diff --git a/src/routes/api/history.ts b/src/routes/api/history.ts
index 04592388..1062baa8 100644
--- a/src/routes/api/history.ts
+++ b/src/routes/api/history.ts
@@ -10,7 +10,35 @@ import {
 } from '../../server/claude-api'
 import { resolveSessionKey } from '../../server/session-utils'
 import { isAuthenticated } from '@/server/auth-middleware'
-import { getLocalSession, getLocalMessages } from '../../server/local-session-store'
+import {
+  getLocalMessages,
+  getLocalSession,
+  type LocalMessage,
+} from '../../server/local-session-store'
+
+export function buildLocalHistoryPayload(
+  sessionKey: string,
+  localMessages: Array<LocalMessage>,
+): Record<string, unknown> {
+  return {
+    sessionKey,
+    sessionId: sessionKey,
+    messages: localMessages.map((m, index) => ({
+      id: m.id,
+      role: m.role,
+      content: [{ type: 'text', text: m.content }],
+      timestamp: m.timestamp,
+      historyIndex: index,
+    })),
+    source: 'local',
+  }
+}
+
+function getLocalHistoryPayload(sessionKey: string): Record<string, unknown> | null {
+  const localSession = getLocalSession(sessionKey)
+  if (!localSession) return null
+  return buildLocalHistoryPayload(sessionKey, getLocalMessages(sessionKey))
+}
 
 export const Route = createFileRoute('/api/history')({
   server: {
@@ -20,7 +48,14 @@ export const Route = createFileRoute('/api/history')({
           return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
         }
         await ensureGatewayProbed()
+        const url = new URL(request.url)
+        const limit = Number(url.searchParams.get('limit') || '200')
+        const rawSessionKey = url.searchParams.get('sessionKey')?.trim()
+        const friendlyId = url.searchParams.get('friendlyId')?.trim()
         if (!getGatewayCapabilities().sessions) {
+          const requestedKey = rawSessionKey || friendlyId
+          const localPayload = requestedKey ? getLocalHistoryPayload(requestedKey) : null
+          if (localPayload) return json(localPayload)
           return json({
             sessionKey: 'new',
             sessionId: 'new',
@@ -30,10 +65,6 @@ export const Route = createFileRoute('/api/history')({
           })
         }
         try {
-          const url = new URL(request.url)
-          const limit = Number(url.searchParams.get('limit') || '200')
-          const rawSessionKey = url.searchParams.get('sessionKey')?.trim()
-          const friendlyId = url.searchParams.get('friendlyId')?.trim()
           let { sessionKey } = await resolveSessionKey({
             rawSessionKey,
             friendlyId,
@@ -98,24 +129,9 @@ export const Route = createFileRoute('/api/history')({
             messages = []
           }
 
-          // Fallback to local session store for portable/local model sessions
-          if (messages.length === 0) {
-            const localSession = getLocalSession(sessionKey)
-            if (localSession) {
-              const localMessages = getLocalMessages(sessionKey)
-              return json({
-                sessionKey,
-                sessionId: sessionKey,
-                messages: localMessages.map((m, index) => ({
-                  id: m.id,
-                  role: m.role,
-                  content: [{ type: 'text', text: m.content }],
-                  timestamp: m.timestamp,
-                  historyIndex: index,
-                })),
-              })
-            }
-          }
+          // Fallback to local session store for portable/local model sessions.
+          const localPayload = messages.length === 0 ? getLocalHistoryPayload(sessionKey) : null
+          if (localPayload) return json(localPayload)
 
           const boundedMessages = limit > 0 ? messages.slice(-limit) : messages
 
diff --git a/src/routes/api/sessions.ts b/src/routes/api/sessions.ts
index b0ee0e8e..ee8c5dd3 100644
--- a/src/routes/api/sessions.ts
+++ b/src/routes/api/sessions.ts
@@ -19,8 +19,36 @@ import {
   getLocalSession,
   listLocalSessions,
   updateLocalSessionTitle,
+  type LocalSession,
 } from '../../server/local-session-store'
 
+function toLocalSessionSummary(ls: LocalSession): Record<string, unknown> {
+  return {
+    key: ls.id,
+    id: ls.id,
+    friendlyId: ls.id,
+    title: ls.title || 'Local Chat',
+    label: ls.title || 'Local Chat',
+    derivedTitle: ls.title || 'Local Chat',
+    startedAt: ls.createdAt,
+    updatedAt: ls.updatedAt,
+    message_count: ls.messageCount,
+    model: ls.model,
+    source: 'local',
+  }
+}
+
+export function buildUnavailableSessionsPayload(
+  localSessions: Array<LocalSession>,
+): Record<string, unknown> {
+  return {
+    ok: true,
+    sessions: localSessions.map(toLocalSessionSummary),
+    source: localSessions.length > 0 ? 'local' : 'unavailable',
+    message: SESSIONS_API_UNAVAILABLE_MESSAGE,
+  }
+}
+
 export const Route = createFileRoute('/api/sessions')({
   server: {
     handlers: {
@@ -31,12 +59,7 @@ export const Route = createFileRoute('/api/sessions')({
         }
         const capabilities = await ensureGatewayProbed()
         if (!capabilities.sessions) {
-          return json({
-            ok: true,
-            sessions: [],
-            source: 'unavailable',
-            message: SESSIONS_API_UNAVAILABLE_MESSAGE,
-          })
+          return json(buildUnavailableSessionsPayload(listLocalSessions()))
         }
 
         try {
diff --git a/src/routes/api/vector-memory/discovery.ts b/src/routes/api/vector-memory/discovery.ts
index 7dbbe408..6ccc3f7b 100644
--- a/src/routes/api/vector-memory/discovery.ts
+++ b/src/routes/api/vector-memory/discovery.ts
@@ -1,52 +1,17 @@
 import { createFileRoute } from '@tanstack/react-router'
 import { json } from '@tanstack/react-start'
-import { isAuthenticated } from '../../../server/auth-middleware'
-import { requireJsonContentType } from '../../../server/rate-limit'
-import {
-  VectorMemoryInputError,
-  storeTeamDiscovery,
-} from '../../../server/vector-memory'
 
 export const Route = createFileRoute('/api/vector-memory/discovery')({
   server: {
     handlers: {
-      POST: async ({ request }) => {
-        if (!isAuthenticated(request)) {
-          return json({ error: 'Unauthorized' }, { status: 401 })
-        }
-        const contentTypeError = requireJsonContentType(request)
-        if (contentTypeError) return contentTypeError
-        try {
-          const body = (await request.json().catch(() => ({}))) as {
-            content?: unknown
-            source?: unknown
-          }
-          if (typeof body.content !== 'string') {
-            return json({ error: 'Discovery content is required' }, { status: 400 })
-          }
-          if (body.source !== undefined && typeof body.source !== 'string') {
-            return json({ error: 'Source must be a string' }, { status: 400 })
-          }
-          const source =
-            typeof body.source === 'string' ? body.source : 'workspace-dashboard'
-          return json(
-            await storeTeamDiscovery({
-              content: body.content,
-              source,
-            }),
-          )
-        } catch (error) {
-          return json(
-            {
-              error:
-                error instanceof Error
-                  ? error.message
-                  : 'Failed to store team discovery',
-            },
-            { status: error instanceof VectorMemoryInputError ? 400 : 500 },
-          )
-        }
-      },
+      POST: async () =>
+        json(
+          {
+            error:
+              'Vector memory writes are disabled in the read-only Workspace dashboard phase.',
+          },
+          { status: 405 },
+        ),
     },
   },
 })
diff --git a/src/screens/memory/vector-memory-screen.tsx b/src/screens/memory/vector-memory-screen.tsx
index 57a07a61..92847964 100644
--- a/src/screens/memory/vector-memory-screen.tsx
+++ b/src/screens/memory/vector-memory-screen.tsx
@@ -52,8 +52,6 @@ type SearchPayload = {
   status: VectorMemoryStatus
 }
 
-type StoredDiscovery = Omit<VectorSearchResult, 'distance' | 'score'>
-
 async function readJson<T>(url: string): Promise<T> {
   const response = await fetch(url)
   const payload = await response.json().catch(() => ({}))
@@ -114,7 +112,6 @@ export function VectorMemoryScreen() {
   const [query, setQuery] = useState('')
   const [collection, setCollection] = useState('all')
   const [selected, setSelected] = useState<VectorSearchResult | null>(null)
-  const [discoveryContent, setDiscoveryContent] = useState('')
 
   const statusQuery = useQuery({
     queryKey: ['vector-memory', 'status'],
@@ -138,32 +135,6 @@ export function VectorMemoryScreen() {
     },
   })
 
-  const storeDiscoveryMutation = useMutation({
-    mutationFn: () =>
-      postJson<{ stored: StoredDiscovery; status: VectorMemoryStatus }>(
-        '/api/vector-memory/discovery',
-        {
-          content: discoveryContent,
-          source: 'workspace-dashboard',
-        },
-      ),
-    onSuccess: (payload) => {
-      setDiscoveryContent('')
-      statusQuery.refetch()
-      setSelected({
-        ...payload.stored,
-        distance: null,
-        score: null,
-      })
-      toast('Stored team discovery in vector memory', { type: 'success' })
-    },
-    onError: (error) => {
-      toast(error instanceof Error ? error.message : 'Failed to store discovery', {
-        type: 'warning',
-      })
-    },
-  })
-
   const status = searchMutation.data?.status || statusQuery.data
   const collections = status?.collections ?? []
   const results = searchMutation.data?.results ?? []
@@ -333,30 +304,10 @@ export function VectorMemoryScreen() {
 
           <div className="rounded-2xl border border-primary-200 bg-primary-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
             <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
-              Safe Control
+              Read-only phase
             </div>
             <div className="mt-1 text-xs text-primary-500 dark:text-neutral-400">
-              Store a curated team discovery in team_knowledge. Destructive controls stay disabled.
-            </div>
-            <textarea
-              value={discoveryContent}
-              onChange={(event) => setDiscoveryContent(event.target.value)}
-              maxLength={4000}
-              placeholder="Durable discovery or operational fact to embed..."
-              className="mt-3 min-h-24 w-full resize-y rounded-xl border border-primary-200 bg-primary-100/60 p-2 text-xs outline-none focus:border-accent-500 dark:border-neutral-800 dark:bg-neutral-900/60"
-            />
-            <div className="mt-2 flex items-center justify-between gap-2">
-              <span className="text-[11px] text-primary-400 dark:text-neutral-500">
-                {discoveryContent.length}/4000
-              </span>
-              <button
-                type="button"
-                onClick={() => storeDiscoveryMutation.mutate()}
-                disabled={!discoveryContent.trim() || storeDiscoveryMutation.isPending}
-                className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
-              >
-                {storeDiscoveryMutation.isPending ? 'Storing...' : 'Store discovery'}
-              </button>
+              This dashboard can inspect Chroma status and run semantic searches. Vector writes, promotion, and authority decisions stay disabled here; source repositories and GitHub artifacts remain the evidence authority.
             </div>
           </div>
         </section>
diff --git a/src/screens/swarm2/swarm2-screen.test.ts b/src/screens/swarm2/swarm2-screen.test.ts
index 4155683b..e1bf2f3d 100644
--- a/src/screens/swarm2/swarm2-screen.test.ts
+++ b/src/screens/swarm2/swarm2-screen.test.ts
@@ -99,7 +99,7 @@ describe('Swarm2 surface contract', () => {
     ])
   })
 
-  it('does not add registry-only entries to the operational worker control surface', () => {
+  it('keeps registry-only entries visible as offline operational worker cards', () => {
     const crew = [{
       id: 'swarm1',
       displayName: 'Live Worker',
@@ -137,8 +137,8 @@ describe('Swarm2 surface contract', () => {
         id: 'swarm99',
         displayName: 'Registry Only Worker',
         role: 'Registry Only',
-        skills: [],
-        capabilities: [],
+        skills: ['review'],
+        capabilities: ['code-review'],
         dispatchEnabled: false,
         source: 'swarm.yaml',
         sourceDerived: true,
@@ -149,6 +149,15 @@ describe('Swarm2 surface contract', () => {
 
     expect(mergeRegistryRosterWithCrew(crew, roster, [])).toEqual([
       expect.objectContaining({ id: 'swarm1', displayName: 'Registry Live Worker' }),
+      expect.objectContaining({
+        id: 'swarm99',
+        displayName: 'Registry Only Worker',
+        role: 'Registry Only',
+        gatewayState: 'offline',
+        processAlive: false,
+        skills: ['review'],
+        capabilities: ['code-review'],
+      }),
     ])
   })
 
diff --git a/src/screens/swarm2/swarm2-screen.tsx b/src/screens/swarm2/swarm2-screen.tsx
index f6e48715..ba3001ba 100644
--- a/src/screens/swarm2/swarm2-screen.tsx
+++ b/src/screens/swarm2/swarm2-screen.tsx
@@ -152,6 +152,8 @@ type RuntimeEntry = {
   phase?: string | null
   lastSummary?: string | null
   lastResult?: string | null
+  lastRealSummary?: string | null
+  lastRealResult?: string | null
   blockedReason?: string | null
   checkpointStatus?: string | null
   needsHuman?: boolean | null
@@ -389,7 +391,35 @@ export function mergeRegistryRosterWithCrew(
   roomIds: Array<string>,
   runtimeByWorker: Map<string, RuntimeEntry> = new Map(),
 ): Array<CrewMember> {
-  return sortSwarmMembers(crew, roomIds).map((member) => {
+  const crewIds = new Set(crew.map((member) => member.id))
+  const registryOnlyMembers: Array<CrewMember> = registryRoster
+    .filter((worker) => worker.id && !crewIds.has(worker.id))
+    .map((worker) => ({
+      id: worker.id,
+      displayName: worker.name,
+      role: worker.role,
+      specialty: worker.specialty,
+      mission: worker.mission,
+      skills: worker.skills ?? [],
+      capabilities: worker.capabilities ?? [],
+      profileFound: true,
+      gatewayState: 'offline',
+      processAlive: false,
+      platforms: {},
+      model: worker.model || 'unknown',
+      provider: 'registry',
+      lastSessionTitle: null,
+      lastSessionAt: null,
+      sessionCount: 0,
+      messageCount: 0,
+      toolCallCount: 0,
+      totalTokens: 0,
+      estimatedCostUsd: null,
+      cronJobCount: 0,
+      assignedTaskCount: 0,
+    }))
+
+  return sortSwarmMembers([...crew, ...registryOnlyMembers], roomIds).map((member) => {
     const runtime = runtimeByWorker.get(member.id)
     const roster = registryRoster.find((worker) => worker.id === member.id)
     return {
@@ -398,8 +428,8 @@ export function mergeRegistryRosterWithCrew(
       role: roster?.role || runtime?.role || member.role,
       specialty: roster?.specialty,
       mission: roster?.mission,
-      skills: roster?.skills ?? [],
-      capabilities: roster?.capabilities ?? [],
+      skills: roster?.skills ?? member.skills ?? [],
+      capabilities: roster?.capabilities ?? member.capabilities ?? [],
       model: roster?.model || member.model,
     }
   })
@@ -572,7 +602,6 @@ function displayTaskTitle(runtime: RuntimeEntry | undefined, fallback: string):
   return cleanSwarmLabel(runtime?.blockedReason || runtime?.currentTask || realSummary || runtime?.lastSummary || realResult || runtime?.lastResult || fallback || '', 'Ready for task', 64)
 }
 
-
 function formatAssignedModel(model?: string | null, provider?: string | null): string {
   const value = `${model || ''} ${provider || ''}`.toLowerCase()
   if (value.includes('claude-opus-4-7') || value.includes('opus-4-7')) return 'Opus 4.7'
@@ -982,28 +1011,21 @@ export function Swarm2Screen() {
           try { parsed = JSON.parse(text) } catch {}
           const msg = parsed.error || text || `HTTP ${res.status}`
           if (msg.includes('tmux not installed')) {
-            toast({
-              title: 'tmux not installed',
-              description:
-                `Swarm worker ${workerId} couldn't start because tmux is not installed on this host. Install tmux (‘brew install tmux’ or ‘apt install tmux’) and try again. See #244.`,
-              variant: 'destructive',
-            })
+            toast(
+              `tmux not installed: Swarm worker ${workerId} couldn't start because tmux is not installed on this host. Install tmux (‘brew install tmux’ or ‘apt install tmux’) and try again. See #244.`,
+              { type: 'error' },
+            )
           } else {
-            toast({
-              title: `Failed to start ${workerId}`,
-              description: msg,
-              variant: 'destructive',
-            })
+            toast(`Failed to start ${workerId}: ${msg}`, { type: 'error' })
           }
           // eslint-disable-next-line no-console
           console.error('[swarm2] start session failed:', res.status, text)
         }
       } catch (err) {
-        toast({
-          title: `Failed to start ${workerId}`,
-          description: err instanceof Error ? err.message : String(err),
-          variant: 'destructive',
-        })
+        toast(
+          `Failed to start ${workerId}: ${err instanceof Error ? err.message : String(err)}`,
+          { type: 'error' },
+        )
       } finally {
         setPendingTmux((prev) => {
           const next = new Set(prev)
diff --git a/src/server/vector-memory.test.ts b/src/server/vector-memory.test.ts
index a25ab870..f1612352 100644
--- a/src/server/vector-memory.test.ts
+++ b/src/server/vector-memory.test.ts
@@ -101,66 +101,10 @@ describe('vector-memory server helpers', () => {
     expect(fetchMock).not.toHaveBeenCalled()
   })
 
-  it('stores dashboard team discoveries with explicit embeddings and Chroma upsert', async () => {
-    existsSync.mockReturnValue(true)
-    readFileSync.mockReturnValue(
-      JSON.stringify({
-        chromadb_host: '127.0.0.1',
-        chromadb_port: 8000,
-        embedding_service_url: 'http://forge.local:8006',
-        embedding_model: 'Qwen/Qwen3-Embedding-0.6B',
-        collections: { team_knowledge: 'team_knowledge' },
-      }),
-    )
-    const fetchMock = vi
-      .fn()
-      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ heartbeat: 1 }) })
-      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
-      .mockResolvedValueOnce({
-        ok: true,
-        json: () => Promise.resolve([{ id: 'team-col-id', name: 'team_knowledge' }]),
-      })
-      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(7) })
-      .mockResolvedValueOnce({
-        ok: true,
-        json: () => Promise.resolve({ embedding: [0.3, 0.4], dimensions: 1024 }),
-      })
-      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
-    vi.stubGlobal('fetch', fetchMock)
-
+  it('does not expose dashboard write helpers in the read-only vector-memory module', async () => {
     const mod = await loadMod()
-    const payload = await mod.storeTeamDiscovery({
-      content: '  Dashboard memory control should remain safe and explicit.  ',
-      source: 'test-suite',
-    })
 
-    expect(fetchMock).toHaveBeenNthCalledWith(
-      5,
-      'http://forge.local:8006/embed-single',
-      expect.objectContaining({
-        method: 'POST',
-        body: JSON.stringify({ text: 'Dashboard memory control should remain safe and explicit.' }),
-      }),
-    )
-    expect(fetchMock).toHaveBeenNthCalledWith(
-      6,
-      'http://127.0.0.1:8000/api/v2/tenants/default_tenant/databases/default_database/collections/team-col-id/upsert',
-      expect.objectContaining({
-        method: 'POST',
-        body: expect.stringContaining('"embeddings":[[0.3,0.4]]'),
-      }),
-    )
-    const upsertBody = JSON.parse(fetchMock.mock.calls[5][1].body)
-    expect(upsertBody.documents).toEqual([
-      'Dashboard memory control should remain safe and explicit.',
-    ])
-    expect(upsertBody.metadatas[0]).toMatchObject({
-      kind: 'team_discovery',
-      source: 'test-suite',
-      created_by: 'workspace-vector-memory',
-    })
-    expect(payload.stored.id).toMatch(/^dashboard-discovery-/)
-    expect(payload.stored.collection).toBe('team_knowledge')
+    expect('storeTeamDiscovery' in mod).toBe(false)
   })
 
   it('queries Forge with the live embed-single contract before Chroma query', async () => {
diff --git a/src/server/vector-memory.ts b/src/server/vector-memory.ts
index 945eb87c..4c659ec9 100644
--- a/src/server/vector-memory.ts
+++ b/src/server/vector-memory.ts
@@ -1,4 +1,3 @@
-import * as crypto from 'node:crypto'
 import * as fs from 'node:fs'
 import * as os from 'node:os'
 import * as path from 'node:path'
@@ -53,13 +52,6 @@ export class VectorMemoryInputError extends Error {
   }
 }
 
-export type StoreTeamDiscoveryResult = {
-  id: string
-  collection: string
-  document: string
-  metadata: Record<string, unknown>
-}
-
 type ChromaCollection = {
   id?: string
   name?: string
@@ -406,77 +398,3 @@ export async function searchVectorMemory(options: {
   results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
   return { results: results.slice(0, limit), status }
 }
-
-function teamKnowledgeCollection(status: VectorMemoryStatus): VectorCollectionStat {
-  const configuredName = status.config.collections.team_knowledge || 'team_knowledge'
-  const collection = status.collections.find(
-    (item) => item.key === 'team_knowledge' || item.name === configuredName,
-  )
-  if (collection) return collection
-  return { key: 'team_knowledge', name: configuredName, id: configuredName, count: null }
-}
-
-async function upsertDocument(
-  config: VectorMemoryConfig,
-  collection: VectorCollectionStat,
-  document: string,
-  embedding: Array<number>,
-  metadata: Record<string, unknown>,
-  id: string,
-): Promise<void> {
-  const idOrName = collection.id || collection.name
-  const body = JSON.stringify({
-    ids: [id],
-    embeddings: [embedding],
-    documents: [document],
-    metadatas: [metadata],
-  })
-  try {
-    await fetchJson<unknown>(
-      `${v2CollectionsUrl(config)}/${encodeURIComponent(idOrName)}/upsert`,
-      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
-    )
-  } catch {
-    await fetchJson<unknown>(
-      `${legacyCollectionsUrl(config)}/${encodeURIComponent(idOrName)}/upsert`,
-      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
-    )
-  }
-}
-
-export async function storeTeamDiscovery(options: {
-  content: string
-  source?: string
-}): Promise<{ stored: StoreTeamDiscoveryResult; status: VectorMemoryStatus }> {
-  const document = options.content.trim()
-  if (!document) throw new VectorMemoryInputError('Discovery content is required')
-  if (document.length > 4000) {
-    throw new VectorMemoryInputError('Discovery content must be 4000 characters or fewer')
-  }
-
-  const status = await getVectorMemoryStatus()
-  if (!status.chroma.ok) throw new Error(status.chroma.error || 'ChromaDB is unavailable')
-  if (!status.embeddings.ok) throw new Error(status.embeddings.error || 'Embedding service is unavailable')
-
-  const collection = teamKnowledgeCollection(status)
-  const embedding = await embedQuery(status.config, document)
-  const createdAt = new Date().toISOString()
-  const id = `dashboard-discovery-${crypto.randomUUID()}`
-  const metadata: Record<string, unknown> = {
-    kind: 'team_discovery',
-    source: options.source?.trim() || 'workspace-dashboard',
-    created_at: createdAt,
-    created_by: 'workspace-vector-memory',
-  }
-
-  await upsertDocument(status.config, collection, document, embedding, metadata, id)
-  return {
-    stored: {
-      id,
-      collection: collection.name,
-      document,
-      metadata,
-    },
-    status,
-  }
-}

