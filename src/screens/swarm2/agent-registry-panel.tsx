import type {
  AgentRegistryBackendMetadata,
  AgentRegistryDiagnostic,
  AgentRegistryEntry,
} from '../../server/agent-registry'

export const AGENT_REGISTRY_SURFACE_COPY =
  'Agent registry rows are source-derived compatibility metadata from swarm.yaml, not live runtime truth. The Phase 1 surface is read-only: no edits, dispatch, source sync, restarts, or evidence promotion are available here.'

export type AgentRegistryPanelInput = {
  entries: Array<AgentRegistryEntry>
  diagnostics: Array<AgentRegistryDiagnostic>
  backend: AgentRegistryBackendMetadata
}

export type AgentRegistryRow = {
  id: string
  title: string
  subtitle: string
  badges: Array<string>
  detailLines: Array<string>
  diagnosticCount: number
}

export function summarizeAgentRegistryDiagnostics(diagnostics: Array<AgentRegistryDiagnostic>) {
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length
  const infoCount = diagnostics.filter((item) => item.severity === 'info').length
  return {
    errorCount,
    warningCount,
    infoCount,
    state: errorCount > 0 ? 'invalid' : warningCount > 0 ? 'warning' : 'valid',
  }
}

export function buildAgentRegistryRows(input: AgentRegistryPanelInput): Array<AgentRegistryRow> {
  return input.entries.map((entry) => {
    const badges = [
      entry.sourceDerived ? 'source-derived' : 'registry',
      input.backend.compatibilityMode ? 'compatibility' : input.backend.kind,
      entry.writable ? 'writable' : 'read-only',
      entry.dispatchEnabled ? 'dispatch-enabled' : 'dispatch-disabled',
    ]
    const diagnostics = input.diagnostics.filter((item) => item.entryId === entry.id)
    const details = [
      `Source: ${entry.source} (${input.backend.sourcePath})`,
      `Capabilities: ${entry.capabilities.length ? entry.capabilities.join(', ') : 'none declared'}`,
      `Skills: ${entry.skills.length ? entry.skills.join(', ') : 'none declared'}`,
      ...entry.disabledActions,
      ...diagnostics.map((item) => `${item.severity.toUpperCase()}: ${item.message}`),
    ]
    return {
      id: entry.id,
      title: entry.displayName || entry.id,
      subtitle: `${entry.role || 'Worker'} · ${entry.model || 'model unknown'}`,
      badges,
      detailLines: details,
      diagnosticCount: diagnostics.length,
    }
  })
}

export function AgentRegistryPanel(input: AgentRegistryPanelInput) {
  const rows = buildAgentRegistryRows(input)
  const summary = summarizeAgentRegistryDiagnostics(input.diagnostics)
  return (
    <section aria-label="Read-only agent registry" className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4 text-sm text-primary-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-500">Read-only registry</p>
          <h2 className="text-lg font-semibold text-ink">Source-derived agent registry</h2>
          <p className="mt-1 max-w-3xl text-xs text-primary-700">{AGENT_REGISTRY_SURFACE_COPY}</p>
        </div>
        <div className="rounded-2xl border border-primary-200 bg-white/70 px-3 py-2 text-xs text-primary-700">
          {summary.state} · {summary.errorCount} errors · {summary.warningCount} warnings
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-primary-200 bg-white/75 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">{row.title}</h3>
                <p className="text-xs text-primary-600">{row.subtitle}</p>
              </div>
              <span className="rounded-full bg-primary-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                {row.id}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {row.badges.map((badge) => (
                <span key={badge} className="rounded-full border border-primary-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary-700">
                  {badge}
                </span>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-primary-700">
              {row.detailLines.slice(0, 5).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
