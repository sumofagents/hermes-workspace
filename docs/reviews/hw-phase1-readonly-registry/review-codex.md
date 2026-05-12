Inspected commit: 372b18a8e4e3fa7947ff3cf5651865560daca0a1
Model: openai-codex/gpt-5.5
Lane: Codex hard-guardrail review
Verdict: APPROVE

Scope reviewed
- Parent task t_2cb9579e handoff and this lane card t_65fc5bc4.
- Repository HEAD and working tree at target commit 372b18a8e4e3fa7947ff3cf5651865560daca0a1; pre-existing untracked pnpm-workspace.yaml was observed and not touched.
- Existing swarm/registry-adjacent code paths:
  - src/server/swarm-roster.ts
  - src/routes/api/swarm-roster.ts
  - src/server/swarm-foundation.ts
  - src/server/swarm-environment.ts
  - src/routes/api/crew-status.ts
  - src/screens/swarm2/swarm2-screen.tsx
  - src/screens/swarm2/operational-worker-card.tsx
  - src/hooks/use-crew-status.ts
  - swarm.yaml

Summary
The Phase 1 read-only registry spine is safe and ready to implement if it remains narrowly read-only and compatibility-focused. The existing repo already has a zod/yaml roster parser and Swarm2 consumes roster metadata, but the current /api/swarm-roster endpoint is mixed read/write and readSwarmRoster silently falls back on validation failures. Phase 1 should therefore add a separate normalized read-only registry contract and UI consumption path rather than extending the existing mutating roster endpoint as the new authority.

Rationale
- The requested slice is operational metadata only: it reads local repository/config artifacts, normalizes worker entries, and renders rows/badges/detail states. It does not require deployment, restarts, dispatch/restart controls, live Sentinel/Rilo/Forge probes, profile/provider writes, dashboard-to-source sync, Atlas mutation, or evidence promotion.
- Existing implementation patterns are compatible with the slice:
  - zod schema/parser precedent exists in src/server/swarm-roster.ts and src/server/swarm-foundation.ts.
  - authenticated read API precedent exists in src/routes/api/swarm-roster.ts and src/routes/api/crew-status.ts.
  - Swarm2 already fetches roster metadata and merges it into crew/runtime cards in src/screens/swarm2/swarm2-screen.tsx.
  - Operational worker cards already render role/model/status badges and detail panels in src/screens/swarm2/operational-worker-card.tsx.
- The compatibility source, swarm.yaml, is in-repo and static for this phase. Reading/parsing it is within the allowed source-derived status boundary.
- The main risk is authority creep: current UI/API naming can make roster/control-plane metadata look canonical. The implementation must explicitly label the registry as normalized read-only workspace metadata and preserve source artifacts as authority.

Required implementation constraints
1. Strict TDD first:
   - Add failing parser/schema tests before implementation.
   - Add failing API route tests before route implementation.
   - Add failing UI tests for rows/badges/detail/error states before UI implementation.
   - Convert any future review finding into a RED regression test before patching.
2. Keep the registry read-only end to end:
   - The Phase 1 route must expose only GET/HEAD-safe behavior.
   - Do not add POST/PUT/PATCH/DELETE to the new registry route.
   - Do not call writeSwarmRoster, upsertSwarmRosterWorker, syncSwarmProfileModel, profile config writers, dispatch endpoints, tmux start/stop endpoints, or dashboard/task mutation endpoints from the registry path.
   - No localStorage writes should be needed for the registry rows/badges/detail rendering.
3. Prefer a new module and route over modifying /api/swarm-roster in place:
   - Suggested module: src/server/worker-registry.ts or src/server/swarm-registry.ts.
   - Suggested API: /api/worker-registry or /api/swarm-registry.
   - Existing /api/swarm-roster can remain as backwards-compatible legacy read/write surface; the new API should be explicitly normalized/read-only.
4. Parser contract:
   - Define typed normalized entries with stable fields such as id, displayName, role, specialty, modelLabel, skills, capabilities, preferredTaskTypes, acceptsBroadcast, reviewRequired, defaultCwd, source, sourcePath, sourceVersion, and validation status.
   - Preserve backend metadata separately from UI labels: source path, source mtime if used, parser version, loadedAt/fetchedAt, backend kind, and compatibility mode.
   - Return validation diagnostics as data, not swallowed fallback behavior. Include issue path, severity, message, and source worker id when applicable.
   - Unknown optional fields in swarm.yaml should be diagnostics/warnings, not hard failures, unless they conflict with required normalized fields.
   - Invalid worker entries should not crash the whole route; return valid normalized entries plus diagnostics unless the file itself is unreadable/unparseable.
5. API contract:
   - Keep existing authentication behavior via isAuthenticated(request).
   - Return a shape like { ok, entries, backend, diagnostics, fetchedAt }.
   - If swarm.yaml is missing or malformed, return ok: true with entries: [] plus diagnostics when possible, or a controlled non-500 error only for truly unreadable backend failures.
   - Do not probe live agent hosts, gateways, Sentinel, Rilo, Forge, tmux, cron, email, financial systems, or external networks.
6. UI contract:
   - Render minimal registry rows/badges/detail states from the new read-only API.
   - Show source/compatibility/diagnostic badges clearly so users can tell roster-derived entries from live runtime state.
   - Do not let the new UI imply dashboard/source sync or edit capability.
   - Keep current operational controls separate from registry details; no dispatch/restart/start/stop affordances should be introduced in this slice.
7. No-mutation tests must be explicit:
   - Test that only GET is implemented for the new route, or that non-GET methods return 405/route-miss without side effects.
   - Mock/spies should assert writeSwarmRoster/upsertSwarmRosterWorker/profile config writers/dispatch helpers are not called by parser/API/UI flows.
   - Include fixtures for valid swarm.yaml, missing file, malformed YAML, invalid worker id, partially invalid worker, unknown fields, duplicate ids, empty workers, and roster-only entries.
   - Include UI tests for validation diagnostics and source badges.
8. Do not regenerate or hand-edit routeTree.gen.ts unless this repo's normal route generation workflow requires it; if generation is required, include that in tests/build evidence, not as an unrelated manual edit.

Findings
- No blocking safety issue found for the proposed Phase 1 implementation as scoped.
- One implementation hazard: src/server/swarm-roster.ts currently catches parse errors and returns fallbackRoster(ids) without diagnostics. The new registry parser must not repeat this silent-fallback pattern; diagnostics are a required output.
- One authority-boundary hazard: Swarm2 currently merges crew, runtime, and roster fields into one member object. The new UI should preserve source labels/badges so normalized registry data is not confused with live runtime truth.
- One route-boundary hazard: /api/swarm-roster currently supports POST mutation. The read-only registry should not share a route surface where a future refactor could accidentally inherit mutation semantics.

Decision
APPROVE implementation to proceed under strict TDD and the constraints above. This approval does not authorize deployment, restart, live-system probing, Atlas evidence mutation/promotion, dispatch controls, profile/provider config writes, dashboard-to-source sync, email/financial/security actions, or any write behavior beyond normal source-code/test artifacts needed for the future implementation card.
