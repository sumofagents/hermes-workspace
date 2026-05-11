# Post-implementation hardening notes

Base commit reviewed: `372b18a8e4e3fa7947ff3cf5651865560daca0a1`

## Codex review loop

- Initial post-implementation bundle: `77490392f89240790c6b7cdedc0e473c3dda64ff520e5b623468653b6e30f33a` -> REQUEST_CHANGES.
- First hardening bundle: `ef8b34ee158d1c72589c519563f84cbc1769c277636cd192d5b0fdf68b8134ae` -> REQUEST_CHANGES.
- Second hardening bundle: `e2f5b12fa8012106c31f5b051a4a841e16f989920922aa0fb50ccf7b557fba6e` -> REQUEST_CHANGES.
- Third hardening bundle: `ccded96bf0c2887c6c3b24ad03fa18d26680a8c85d4baac78ab54f563ea5cfa0` -> prior findings closed, new Important finding on leftover Add Swarm mutation path.

## Reviewer findings addressed

1. Secret-looking worker values were diagnosed but still normalized into API/UI-visible entries.
   - Added coverage asserting secret-looking rows produce no entries and cannot appear in serialized API entries.
   - Parser now drops any worker containing a secret-like value before normalization.

2. Existing-but-unreadable registry source could throw uncontrolled read errors.
   - Added coverage using an existing directory path as an unreadable source.
   - `loadAgentRegistry` now returns structured `source_unreadable` diagnostics with backend metadata.

3. Worker IDs were only validated as non-empty strings.
   - Added coverage for path-like malformed IDs.
   - Parser now requires compatibility IDs matching `swarm<digits>` and emits `invalid_worker_id` without returning malformed entries.

4. Non-GET method behavior had only constant-level coverage.
   - Added route handler coverage asserting only `GET` and `HEAD` handlers are registered and no `POST`/`PUT`/`PATCH`/`DELETE` handlers exist on `/api/agent-registry`.

5. Secret detector missed bearer/AWS/PEM-like families and could echo secret-like IDs through diagnostics.
   - Added coverage for bearer tokens, AWS `AKIA`/`ASIA`-style keys, PEM private-key headers, and secret-like IDs.
   - Expanded `maybeSecret` and added `diagnosticEntryId` to omit secret-like IDs from diagnostics.

6. Unsupported schema versions could still return normalized entries.
   - Added coverage for `version: 2` with a valid-looking worker.
   - Parser now returns immediately with `schema_version_unsupported` and no entries when document version is not exactly `1`.

7. Top-level secret-looking values could coexist with valid workers.
   - Added coverage for a top-level `metadata: ASIA...` value plus valid-looking worker.
   - Added `scanTopLevelSecrets` to fail closed before worker normalization when non-worker top-level values contain secret-looking content.

8. Swarm2 consumed `registry.entries` without checking `ok === true`.
   - Added `agentRegistryResponseEntries` helper and coverage asserting entries are ignored when API payload is `ok: false`.
   - Swarm2 now derives registry roster rows only through that helper.

9. Old Add Swarm mutation flow remained reachable after registry swap.
   - Added source-level coverage asserting the Phase 1 surface does not retain `fetch('/api/swarm-roster')`, `rosterQuery`, or `Add Swarm` remnants.
   - Removed the old Add Swarm button, modal, save handler, stale `rosterQuery` references, model picker plumbing, and `/api/swarm-roster` dependency from the Swarm2 Phase 1 surface.

## Verification after Add Swarm removal

- `pnpm vitest run src/screens/swarm2/swarm2-screen.test.ts --reporter=verbose`: 15 passed.
- `pnpm vitest run src/server/agent-registry.test.ts src/routes/api/-agent-registry.test.ts src/screens/swarm2/agent-registry-panel.test.ts src/screens/swarm2/swarm2-screen.test.ts --reporter=verbose`: 4 files, 28 passed.
- `pnpm build`: success for client and SSR builds.
- `git diff --check`: clean.
- Targeted forbidden-surface scans: clean.

No deploy, restart, live Sentinel/Rilo/Forge probes, Atlas mutation/evidence promotion, dispatch/restart controls, email/financial/security actions, profile/provider config writes, or dashboard-to-source sync were performed.
