import { describe, expect, it } from 'vitest'
import { buildUnavailableSessionsPayload } from './sessions'

describe('GET /api/sessions fallback payload', () => {
  it('returns local portable sessions when backend sessions capability is unavailable', () => {
    const payload = buildUnavailableSessionsPayload([
      {
        id: 'local-1',
        title: 'Recovered Workspace Chat',
        model: 'hermes-agent',
        createdAt: 1000,
        updatedAt: 2000,
        messageCount: 7,
      },
    ])

    expect(payload).toMatchObject({
      ok: true,
      source: 'local',
      sessions: [
        {
          key: 'local-1',
          id: 'local-1',
          friendlyId: 'local-1',
          title: 'Recovered Workspace Chat',
          label: 'Recovered Workspace Chat',
          derivedTitle: 'Recovered Workspace Chat',
          startedAt: 1000,
          updatedAt: 2000,
          message_count: 7,
          model: 'hermes-agent',
          source: 'local',
        },
      ],
    })
  })
})
