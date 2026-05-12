# Merge handoff: Phase 1 read-only agent registry spine

## Status

Merge-ready for user review. Controller intentionally did not commit, push, merge, or deploy.

## Repository

- Path: `/Users/jeremiah/hermes-workspace/third-party/hermes-workspace`
- Remote: `https://github.com/outsourc-e/hermes-workspace.git`
- Default branch: `main`
- Current branch at handoff: `main`

## Final gate

- Final bundle: `/Users/jeremiah/hermes-workspace/.hermes/artifacts/hw-phase1-postimpl-review-20260511/review-bundle-after-semantic-key-redaction-fix.md`
- Final bundle sha256: `435d5bc107ac0740c16d9c73f4efd86a06621be66e2b20044e8961440af6a2a9`
- Codex GPT-5.5 review: APPROVE, no findings
- Claude Max review: APPROVE, no findings
- Board custody card: `t_0c309b03`, done

## Verification run

- `pnpm vitest run src/server/agent-registry.test.ts src/routes/api/-agent-registry.test.ts src/screens/swarm2/agent-registry-panel.test.ts src/screens/swarm2/swarm2-screen.test.ts --reporter=verbose`
  - PASS: 4 files, 29 tests
- `pnpm build`
  - PASS
- `git diff --check`
  - PASS

## Recommended commit branch

```bash
git fetch origin --prune
git checkout -b feat/phase1-readonly-agent-registry origin/main
```

Because the working tree currently contains the completed changes on `main`, if you create the branch after the fact from this checkout, use:

```bash
git checkout -b feat/phase1-readonly-agent-registry
```

## Recommended commit scope

Include these files:

```bash
git add \
  src/routeTree.gen.ts \
  src/screens/swarm2/swarm2-screen.tsx \
  src/screens/swarm2/swarm2-screen.test.ts \
  src/routes/api/agent-registry.ts \
  src/routes/api/-agent-registry.test.ts \
  src/screens/swarm2/agent-registry-panel.tsx \
  src/screens/swarm2/agent-registry-panel.test.ts \
  src/server/agent-registry.ts \
  src/server/agent-registry.test.ts \
  docs/reviews/hw-phase1-readonly-registry/
```

Do not include by default:

```bash
pnpm-workspace.yaml
```

Reason: it was pre-existing untracked root config. It was included in the final review bundle for completeness, but should stay out of the Phase 1 feature commit unless you explicitly want to scope pnpm build-approval config into the PR.

## Suggested commit message

```text
feat: add read-only agent registry spine

- Add GET/HEAD-only /api/agent-registry route backed by swarm.yaml parsing
- Add fail-closed schema, parser diagnostics, secret/key redaction, and no-mutation loader coverage
- Render read-only source-derived registry metadata in Swarm2 without granting operational controls
- Remove the old Swarm2 Add Swarm roster mutation surface from the Phase 1 UI
- Preserve mixed Codex/Claude review artifacts under docs/reviews
```

## Suggested PR body

```markdown
## Summary
- Adds a Phase 1 read-only agent registry spine sourced from `swarm.yaml`.
- Adds authenticated GET/HEAD-only `/api/agent-registry` payload with normalized entries, backend metadata, diagnostics, timestamps, and parser versioning.
- Integrates read-only registry metadata into Swarm2 while preventing registry-only rows from gaining operational controls.
- Removes the old mutating Add Swarm roster UI surface from Swarm2.
- Hardens diagnostics so invalid IDs, secret-like values, token-family strings, raw YAML parser snippets, and semantic credential keys are not echoed.

## Safety / Scope
- No deploy/restart/dispatch controls added.
- No Atlas mutation.
- No profile/provider writes.
- `/api/agent-registry` registers only GET and HEAD.
- Registry-only source-derived workers display only in the read-only panel; they do not become operational worker cards.

## Verification
- `pnpm vitest run src/server/agent-registry.test.ts src/routes/api/-agent-registry.test.ts src/screens/swarm2/agent-registry-panel.test.ts src/screens/swarm2/swarm2-screen.test.ts --reporter=verbose` — PASS, 29 tests.
- `pnpm build` — PASS.
- `git diff --check` — PASS.

## Independent Review Gate
- Codex GPT-5.5: APPROVE, no findings.
- Claude Max: APPROVE, no findings.
- Final bundle sha256: `435d5bc107ac0740c16d9c73f4efd86a06621be66e2b20044e8961440af6a2a9`.
- Custody artifacts: `/Users/jeremiah/hermes-workspace/.hermes/artifacts/hw-phase1-postimpl-review-20260511/`.
```

## Post-commit checks

After committing, rerun:

```bash
pnpm vitest run src/server/agent-registry.test.ts src/routes/api/-agent-registry.test.ts src/screens/swarm2/agent-registry-panel.test.ts src/screens/swarm2/swarm2-screen.test.ts --reporter=verbose
pnpm build
git diff --check
```

Then verify PR scope with:

```bash
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```
