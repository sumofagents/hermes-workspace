Inspected commit: 372b18a8e4e3fa7947ff3cf5651865560daca0a1
Model: claude-code/opus-4-7
Lane: Claude Code/Max hard-guardrail review
Verdict: APPROVE

Note: Local Claude Code OAuth failed with 401 despite auth status. The first sentinel-routed attempt correctly BLOCKED due missing macOS artifact paths. This final D-lane review was reissued through Claude Code/Max on sentinel with a self-contained bundle assembled by the macOS controller from the cited readiness plan and board artifacts. Bundle sha256: b0965167a06642911538acd278c19b2915e425869317bbc6981bc705c8104342.

# Phase 1 Hermes Workspace Read-only Registry Spine — Claude D Lane Review

Operating in read-only review mode. I cannot independently recompute the bundle sha256 from inside this conversation (the bundle is the text I received, not a file at a known path on this Linux host), so I am reviewing on the bundle's textual content and echoing the anchors as declared. The E reconciler must verify hash equality with the C lane's anchors.

## 1. Verdict

**APPROVE** (Phase 1 implementation only, conditional on E-lane reconciler also approving the same artifact anchors).

This authorizes the controller to begin TDD implementation of the read-only registry spine in the declared worktree. It does **not** authorize deploy, restart, live probes, profile/provider writes, dispatch, or Atlas/Sentinel/Forge interaction.

## 2. Artifact anchors (echoed verbatim)

- Readiness plan sha256: `e7eb957178ce0d8d7aafbf8bae4f4327382fd346643817b8818ab5d8731d0a5f`
- Target repo commit: `372b18a8e4e3fa7947ff3cf5651865560daca0a1`
- Gate bundle sha256 (asserted by macOS controller): `b0965167a06642911538acd278c19b2915e425869317bbc6981bc705c8104342`

Approval is bound to these three anchors. Any divergence at the E lane should trigger reissue, not silent acceptance.

## 3. Exact scope approved

The Phase 1 slice as defined in the readiness plan and Future Mixed-Agent Gate (T-0101-06-02):

1. Typed read-only agent registry schema/parser (`agents.v1` shape from the canonical schema artifact).
2. `swarm.yaml` as the first compatibility input; `agents.yaml` may be introduced as the intended source but not as a write target in Phase 1.
3. One read-only API route returning normalized registry entries + backend metadata + validation diagnostics.
4. Minimal UI rows/badges/detail surfaces under existing Workspace/Swarm surfaces; **not** inline in `swarm2-screen.tsx`.
5. Fixture samples for valid/invalid/duplicate/secret-looking inputs.
6. Local unit/API/UI tests proving no mutation on read.

Out of scope (explicitly blocked): all items enumerated in §6 below.

## 4. Required RED tests before code

Author and commit these failing first, per the TDD requirement:

- **Schema validation — success path**: a known-good `agents.v1` fixture parses into the typed shape; `schema_version` mismatch fails closed.
- **Schema validation — failure paths**: missing `id`/`display_name`/`profile`/`role`/`runtime.kind`/`runtime.entrypoint`/`permissions.*`/`workspace.policy`; bad regex on `id`; unknown `runtime.kind`; unknown `status`.
- **Duplicate ids**: two entries sharing `id` fail validation with a diagnostic naming the duplicate.
- **Secret-looking values**: fields containing patterns resembling API keys, OAuth tokens, bearer headers, AWS keys, `-----BEGIN`, etc. fail or are surfaced as redaction diagnostics. Secrets are forbidden anywhere in the registry.
- **`dispatch_enabled` fail-closed**: defaults to `false`; `dispatch_enabled: true` rejected unless `status` is `active`/`experimental` **and** `authorization.mode` is set.
- **Permission escalation rules**: `network: unrestricted`, `filesystem: host_write`, and `secrets: allowlist` (empty list) all fail closed without explicit authorization metadata.
- **Backend metadata shape**: API route returns the typed backend descriptor (detected/writable/path/source) modeled after `KanbanBackend` — but `writable` is always `false` in Phase 1.
- **No-mutation read path**: parsing/reading the registry does not write to `swarm.yaml`, profile `config.yaml`, `runtime.json`, `workspace-overrides.json`, or any SQLite/JSON store. Assert via filesystem mtime + spy on write helpers.
- **No live probes on read**: assert no network calls to Sentinel/Rilo/Forge/Atlas hosts, no SSH, no tmux send-keys, no `swarm-profile-config.ts` invocation, no local-provider auto-write, during a registry read or page render.
- **API error surfaces**: invalid registry returns a structured error payload, not a 500 with stack; consumer can render a disabled state with reason.
- **UI disabled-action reasons**: each disabled action chip carries a machine-readable reason code (e.g. `dispatch_disabled_by_default`, `status_blocked`, `missing_authorization`).
- **Source-of-truth precedence**: when `swarm.yaml` and any browser-local override disagree, the registry read returns the file-backed value and surfaces a drift warning.

These tests must be RED at the C/D handoff and turn GREEN through the implementation slice.

## 5. Likely files/modules to touch

Based on the extension-points artifact:

- **New, preferred**:
  - `src/server/agent-registry.ts` — typed schema + parser + backend interface (modeled on `KanbanBackend`).
  - `src/server/agent-registry-backends/swarm-yaml.ts` — read-only adapter over current `swarm.yaml`.
  - `src/routes/api/agents.ts` (or `src/routes/api/agent-registry.ts`) — read-only HTTP route returning normalized entries + backend meta + diagnostics.
  - `src/lib/agent-registry-types.ts` — shared frontend types/hooks.
  - `src/hooks/use-agent-registry.ts` — read-only hook for UI consumers.
  - `src/components/swarm/agent-registry-row.tsx` (or similar small component) — display row + disabled-action chips.
  - Fixtures under `src/server/__fixtures__/agent-registry/` (valid, invalid, duplicate, secret-bearing, dispatch-enabled-bad).
  - Tests colocated as `*.test.ts` / `*.test.tsx`.
- **Touched lightly, by composition only**:
  - `src/screens/swarm2/swarm2-screen.tsx` — compose new component; do **not** inline registry logic; do **not** expand role-preset duplication.
  - `docs/swarm/ARCHITECTURE.md`, `docs/swarm/ROLES.md` — minimal doc updates reflecting the new read-only surface.
- **Read-referenced, not modified**: `src/server/swarm-roster.ts`, `src/server/kanban-backend.ts` (adapter pattern reference), `src/server/gateway-capabilities.ts` (capability gate pattern reference), root `swarm.yaml`.

## 6. Files/modules explicitly forbidden in Phase 1

No writes, edits, or new behavior in:

- `src/routes/api/swarm-dispatch.ts` and `src/server/swarm-missions.ts` — dispatch.
- `src/server/swarm-lifecycle.ts`, `src/server/terminal-sessions.ts`, `src/server/pty-helper.py` — restart/lifecycle/tmux send-keys.
- `src/server/swarm-profile-config.ts` — profile config sync (write boundary).
- `src/server/local-provider-discovery.ts`, `src/routes/api/local-providers.ts`, `src/routes/api/models.ts`, `src/screens/settings/providers-screen.tsx`, provider-wizard — provider/model config writes.
- `src/server/swarm-notifications.ts` — notification sinks.
- `src/server/swarm-checkpoints.ts`, `src/server/swarm-chat-reader.ts`, `src/server/swarm-memory.ts` — runtime/memory writes.
- Anything under Atlas board paths, `atlas-info-geometry-validation`, Atlas repo, or Sentinel/Forge SSH.
- Dashboard-to-source sync, board-to-source sync.
- Mail plane, financial domain, credential/security mutation, GPU/Foundry job launch.
- `workspace-overrides.json` writes; `state.db` writes; tmux `send-keys`; `runtime.json` mutation.
- `pnpm-workspace.yaml` and `docs/reviews/` (the existing untracked items in target repo status) — do not auto-commit or modify as part of this slice; treat as user's in-progress work.

## 7. Non-interference constraints to include in worker prompts

Copy these verbatim (or equivalent) into both Codex C-lane and Claude D-lane implementation prompts and the E reconciler:

1. Operate only inside the declared worktree at repo commit `372b18a8e4e3fa7947ff3cf5651865560daca0a1`. Do not edit shared checkouts.
2. No Sentinel/Rilo/Forge/Atlas live-system inspection. No SSH. No host probes. No tmux send-keys. No service start/stop/restart.
3. No Atlas board reads, mutations, or evidence promotion. No board-to-source sync.
4. No deploy, no restart, no `npm/pnpm start`, no dev server side effects beyond local test runs.
5. No profile config writes (`swarm-profile-config.ts`), no provider config writes, no `workspace-overrides.json` writes, no SQLite/JSON store writes.
6. No dispatch endpoint changes. No notification sink changes. No lifecycle/handoff/renewal behavior changes.
7. Registry read path must be provably side-effect-free: assert with tests, not just comments.
8. Treat `dispatch_enabled` as fail-closed: default false, explicit opt-in required, never inferred.
9. Secrets are forbidden in the registry. Detect and refuse to load secret-looking values.
10. Fail closed and surface diagnostics for unknown `schema_version`, unknown enums, missing required fields, duplicate ids, and ambiguous source of truth.
11. Do not treat memory, Kanban status, child-agent prose, or dashboard chips as authoritative evidence.
12. Do not commit `pnpm-workspace.yaml` or `docs/reviews/` changes; preserve as user's in-progress state.
13. RED tests must land before implementation; do not skip the failing-first step.
14. Custody: preserve prompts, lane outputs, reconciler report, diff bundle, test logs, SHA256SUMS in durable `.hermes` artifact path. Cite exact branch/commit.
15. Claude lane uses Claude Code/Max OAuth, not Anthropic API key. Codex lane uses Codex CLI OAuth GPT-5.5. Lane contamination = block.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Source-of-truth drift (root `swarm.yaml` vs browser local vs runtime JSON vs profile config vs docs) | Define precedence in the parser; emit a drift diagnostic; tests assert file-backed truth wins; UI shows a non-authoritative chip. |
| Silent fallback hiding malformed registry (current `swarm-roster.ts` pattern) | Phase 1 surfaces all parse errors in API response and UI; no swallowed exceptions; structured diagnostics in tests. |
| `swarm2-screen.tsx` god-module growth | Put registry types/hooks in small modules; compose, don't inline; reviewer rejects inline expansion. |
| Direct SQLite/JSON write creep | Phase 1 backend interface is read-only; `writable: false` is invariant; tests spy on write helpers and fail on call. |
| Lane contamination (different artifact hashes between C and D) | E reconciler verifies anchors; mismatch = reissue, not merge. This review is bound to the three anchors echoed above. |
| Multi-host / remote agent assumptions leaking into local-path code | Adapter interface names local-only assumptions explicitly; remote adapters are deferred, not stubbed under local paths. |
| Review-lane semantics inconsistent upstream (`review` vs `ready` in dashboard proxy vs synthetic kanban) | Phase 1 does not redefine review semantics; registry only exposes declared status; UI shows source-owned chips. |
| Untracked `docs/reviews/` and `pnpm-workspace.yaml` in target repo status | Workers prompted not to touch or commit these; treat as user's pending work; reviewer flags any incidental changes. |
| Tests passing because mocked I/O hides real read-path side effects | Use real filesystem fixtures in temp dirs; assert mtime invariants; ban network/SSH/tmux mocks that could conceal probes. |
| Approval drift: someone interpreting this as deploy/restart approval | This review states explicitly in §1 that deploy/restart/live-probe are excluded; worker prompts repeat the constraint. |

## 9. Minimal implementation sequence

1. Create or verify clean worktree at the declared path on the macOS controller, pinned to commit `372b18a8e4e3fa7947ff3cf5651865560daca0a1`. Branch named for this slice (e.g. `t-0101-impl-01-registry-spine`).
2. Land fixtures: valid `agents.v1`, invalid (missing required, bad enum, bad id regex), duplicate ids, secret-bearing, `dispatch_enabled: true` without authorization.
3. Write RED tests enumerated in §4. Confirm all fail.
4. Implement `src/server/agent-registry.ts` (typed schema + parser + diagnostics) until schema/validation tests go GREEN.
5. Implement `src/server/agent-registry-backends/swarm-yaml.ts` (read-only adapter) until backend/no-mutation tests go GREEN.
6. Implement `src/routes/api/agents.ts` until API tests go GREEN. Assert structured error payloads.
7. Implement `src/lib/agent-registry-types.ts`, `src/hooks/use-agent-registry.ts`, and a small display component. Compose under `/swarm2` without touching dispatch/lifecycle code. UI tests GREEN.
8. Run the no-probe and no-write assertions across the whole test suite. GREEN.
9. Update `docs/swarm/ARCHITECTURE.md` and `docs/swarm/ROLES.md` minimally to reflect the read-only registry surface.
10. Custody bundle: collect prompts, C/D outputs, this review, E reconciler report, diff, test logs, SHA256SUMS. Place under durable `.hermes` artifact path. Do not deploy. Do not restart. Do not run live probes. Hand back to controller for Phase 2 gating.

## 10. Final concise recommendation

Approve Phase 1 implementation start, contingent on the E reconciler confirming the same artifact anchors (`e7eb957178ce0d8d7aafbf8bae4f4327382fd346643817b8818ab5d8731d0a5f` plan / `372b18a8e4e3fa7947ff3cf5651865560daca0a1` repo / `b0965167a06642911538acd278c19b2915e425869317bbc6981bc705c8104342` bundle). The scope is narrow, fail-closed, and well-bounded by the planning artifacts. Land RED tests first, keep `swarm-dispatch.ts` / `swarm-profile-config.ts` / `local-provider-discovery.ts` untouched, do not promote anything to Atlas, and do not deploy or restart. If C-lane anchors diverge or the bundle hash cannot be reproduced by the controller, treat this approval as void and reissue.
