import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SWARM2_CARD_DENSITY_CONTRACT,
  SWARM2_INFORMATION_HIERARCHY,
  SWARM2_OPERATIONS_REUSE,
  SWARM2_REAL_API_ENDPOINTS,
  SWARM2_SURFACE_CONTRACT,
  agentRegistryResponseEntries,
  mergeRegistryRosterWithCrew,
  registryEntriesToRosterWorkers,
} from './swarm2-screen'

describe('Swarm2 surface contract', () => {
  it('keeps Aurora as the primary hub above wired operational worker cards', () => {
    expect(SWARM2_INFORMATION_HIERARCHY[0]).toContain('Status header')
    expect(SWARM2_INFORMATION_HIERARCHY[1]).toContain(
      'Aurora/orchestrator hub card',
    )
    expect(SWARM2_INFORMATION_HIERARCHY[2]).toContain('Visible routing wires')
    expect(SWARM2_INFORMATION_HIERARCHY[3]).toContain(
      'Operations-style worker node cards',
    )
    expect(SWARM2_INFORMATION_HIERARCHY[4]).toContain('Minimal attention rail')
    expect(SWARM2_INFORMATION_HIERARCHY[5]).toContain(
      'Central bottom router chat',
    )
    expect(SWARM2_INFORMATION_HIERARCHY).toContainEqual(expect.stringContaining('Kanban view'))
    expect(SWARM2_INFORMATION_HIERARCHY).toContainEqual(expect.stringContaining('Runtime view'))
  })

  it('documents the operational surfaces without replacing /swarm', () => {
    expect(SWARM2_SURFACE_CONTRACT.route).toBe('/swarm2')
    expect(SWARM2_SURFACE_CONTRACT.keepsLegacySwarmRoute).toBe(true)
    expect(SWARM2_SURFACE_CONTRACT.primarySurface).toBe(
      'orchestrator-card-topology',
    )
    expect(SWARM2_SURFACE_CONTRACT.workerSurface).toBe(
      'operations-card-patterns',
    )
    expect(SWARM2_SURFACE_CONTRACT.connectionLayer).toBe(
      'visible-routing-wires',
    )
    expect(SWARM2_SURFACE_CONTRACT.alternateSurface).toBe('runtime-tmux')
    expect(SWARM2_SURFACE_CONTRACT.routerPlacement).toBe('bottom-center')
    expect(SWARM2_SURFACE_CONTRACT.cardInlineChat).toBe(true)
    expect(SWARM2_SURFACE_CONTRACT.routerDefaultOpen).toBe(false)
  })

  it('only depends on existing first-party APIs', () => {
    expect(SWARM2_REAL_API_ENDPOINTS).toEqual([
      '/api/crew-status',
      '/api/swarm-environment',
      '/api/swarm-runtime',
      '/api/swarm-missions',
      '/api/agent-registry',
      '/api/integrations',
      '/api/swarm-health',
      '/api/swarm-decompose',
      '/api/swarm-dispatch',
      '/api/swarm-tmux-start',
      '/api/swarm-tmux-stop',
      '/api/swarm-tmux-scroll',
      '/api/terminal-stream',
      '/api/terminal-input',
      '/api/terminal-resize',
      '/api/terminal-close',
    ])
  })

  it('maps read-only registry entries into roster worker metadata without dispatch state', () => {
    expect(registryEntriesToRosterWorkers([
      {
        id: 'swarm5',
        displayName: 'Builder',
        role: 'Primary Builder',
        specialty: 'implementation',
        model: 'GPT-5.5',
        mission: 'Ship focused slices.',
        skills: ['swarm-ui-worker'],
        capabilities: ['code-editing'],
        dispatchEnabled: false,
        source: 'swarm.yaml',
        sourceDerived: true,
        writable: false,
        disabledActions: ['Registry is read-only in Phase 1.'],
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'swarm5',
        name: 'Builder',
        role: 'Primary Builder',
        specialty: 'implementation',
        model: 'GPT-5.5',
        mission: 'Ship focused slices.',
        skills: ['swarm-ui-worker'],
        capabilities: ['code-editing'],
      }),
    ])
  })

  it('does not add registry-only entries to the operational worker control surface', () => {
    const crew = [{
      id: 'swarm1',
      displayName: 'Live Worker',
      role: 'Runtime',
      profileFound: true,
      gatewayState: 'online',
      processAlive: true,
      platforms: {},
      model: 'runtime-model',
      provider: 'runtime-provider',
      lastSessionTitle: null,
      lastSessionAt: null,
      sessionCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      totalTokens: 0,
      estimatedCostUsd: null,
      cronJobCount: 0,
      assignedTaskCount: 0,
    }]
    const roster = registryEntriesToRosterWorkers([
      {
        id: 'swarm1',
        displayName: 'Registry Live Worker',
        role: 'Registry Role',
        skills: [],
        capabilities: [],
        dispatchEnabled: false,
        source: 'swarm.yaml',
        sourceDerived: true,
        writable: false,
        disabledActions: ['Registry is read-only in Phase 1.'],
      },
      {
        id: 'swarm99',
        displayName: 'Registry Only Worker',
        role: 'Registry Only',
        skills: [],
        capabilities: [],
        dispatchEnabled: false,
        source: 'swarm.yaml',
        sourceDerived: true,
        writable: false,
        disabledActions: ['Registry is read-only in Phase 1.'],
      },
    ])

    expect(mergeRegistryRosterWithCrew(crew, roster, [])).toEqual([
      expect.objectContaining({ id: 'swarm1', displayName: 'Registry Live Worker' }),
    ])
  })

  it('does not consume registry entries when the read-only API reports ok=false', () => {
    expect(agentRegistryResponseEntries({
      ok: false,
      registry: {
        entries: [{
          id: 'swarm9',
          displayName: 'Rejected',
          role: 'Ops',
          skills: [],
          capabilities: [],
          dispatchEnabled: false,
          source: 'swarm.yaml',
          sourceDerived: true,
          writable: false,
          disabledActions: [],
        }],
      },
    })).toEqual([])
  })

  it('does not retain the old mutating Add Swarm roster flow in the Phase 1 read-only surface', () => {
    const source = readFileSync('src/screens/swarm2/swarm2-screen.tsx', 'utf8')
    expect(source).not.toContain("fetch('/api/swarm-roster'")
    expect(source).not.toContain('rosterQuery')
    expect(source).not.toContain('Add Swarm')
  })

  it('documents Operations card primitives reused for Swarm2 worker nodes', () => {
    expect(SWARM2_OPERATIONS_REUSE).toEqual([
      'centered-card-header-with-status-dot',
      'agent-progress-avatar-stack',
      'compact-operational-metadata-panel',
      'inline-direct-chat-panel',
      'bottom-card-action-row',
    ])
  })

  it('keeps the default control plane denser than a terminal wall on laptop screens', () => {
    expect(SWARM2_CARD_DENSITY_CONTRACT.defaultView).toBe('cards')
    expect(SWARM2_CARD_DENSITY_CONTRACT.runtimeView).toBe('separate-mode')
    expect(SWARM2_CARD_DENSITY_CONTRACT.workerCardMinHeightRem).toBeLessThanOrEqual(30)
    expect(SWARM2_CARD_DENSITY_CONTRACT.laptopGridColumns).toBeGreaterThanOrEqual(2)
    expect(SWARM2_CARD_DENSITY_CONTRACT.duplicateEmptyStates).toBe(false)
  })
})

import { __runtimeTabInternals } from './swarm2-screen'

describe('Swarm2 runtime tab command resolution', () => {
  const { commandForRuntime } = __runtimeTabInternals

  it('prefers tmux attach when an attachable session exists', () => {
    const result = commandForRuntime({
      workerId: 'swarm4',
      currentTask: null,
      recentLogTail: null,
      pid: null,
      startedAt: null,
      lastOutputAt: null,
      cwd: '/tmp',
      tmuxSession: 'swarm-swarm4',
      tmuxAttachable: true,
      logPath: '/tmp/agent.log',
      terminalKind: 'tmux',
    })
    expect(result.kind).toBe('tmux')
    expect(result.command).toEqual(['tmux', 'attach', '-t', 'swarm-swarm4'])
    expect(result.label).toContain('tmux:swarm-swarm4')
  })

  it('prefers a chat-able shell over read-only log tail when no tmux is available', () => {
    const result = commandForRuntime({
      workerId: 'swarm4',
      currentTask: null,
      recentLogTail: null,
      pid: null,
      startedAt: null,
      lastOutputAt: null,
      cwd: '/tmp/work',
      tmuxSession: null,
      tmuxAttachable: false,
      logPath: '/tmp/agent.log',
      terminalKind: 'shell',
    })
    expect(result.kind).toBe('shell')
    expect(result.command[0]).toBe('zsh')
    expect(result.command.join(' ')).toContain('cd "/tmp/work"')
  })

  it('falls back to tail -F when no tmux and no cwd are available', () => {
    const result = commandForRuntime({
      workerId: 'swarm4',
      currentTask: null,
      recentLogTail: null,
      pid: null,
      startedAt: null,
      lastOutputAt: null,
      cwd: null,
      tmuxSession: null,
      tmuxAttachable: false,
      logPath: '/tmp/agent.log',
      terminalKind: 'log-tail',
    })
    expect(result.kind).toBe('log-tail')
    expect(result.command).toEqual(['tail', '-n', '200', '-F', '/tmp/agent.log'])
  })

  it('falls back to a workspace shell when no tmux and no log file exist', () => {
    const result = commandForRuntime({
      workerId: 'swarm4',
      currentTask: null,
      recentLogTail: null,
      pid: null,
      startedAt: null,
      lastOutputAt: null,
      cwd: '/tmp/work',
      tmuxSession: null,
      tmuxAttachable: false,
      logPath: null,
      terminalKind: 'shell',
    })
    expect(result.kind).toBe('shell')
    expect(result.command[0]).toBe('zsh')
    expect(result.command.join(' ')).toContain('cd "/tmp/work"')
  })

  it('handles entirely missing runtime metadata gracefully', () => {
    const result = commandForRuntime(undefined)
    expect(result.kind).toBe('shell')
    expect(result.command[0]).toBe('zsh')
  })

  it('mode=logs forces tail -F even when a cwd would normally win', () => {
    const result = commandForRuntime(
      {
        workerId: 'swarm4',
        currentTask: null,
        recentLogTail: null,
        pid: null,
        startedAt: null,
        lastOutputAt: null,
        cwd: '/tmp/work',
        tmuxSession: null,
        tmuxAttachable: false,
        logPath: '/tmp/agent.log',
        terminalKind: 'shell',
      },
      'logs',
    )
    expect(result.kind).toBe('log-tail')
    expect(result.command).toContain('-F')
  })

  it('mode=shell skips tmux attach in favor of a workspace shell', () => {
    const result = commandForRuntime(
      {
        workerId: 'swarm4',
        currentTask: null,
        recentLogTail: null,
        pid: null,
        startedAt: null,
        lastOutputAt: null,
        cwd: '/tmp/work',
        tmuxSession: 'swarm-swarm4',
        tmuxAttachable: true,
        logPath: '/tmp/agent.log',
        terminalKind: 'tmux',
      },
      'shell',
    )
    expect(result.kind).toBe('shell')
    expect(result.command[0]).toBe('zsh')
  })
})

