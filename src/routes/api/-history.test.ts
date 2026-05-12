import { describe, expect, it } from 'vitest'
import { buildLocalHistoryPayload } from './history'

describe('GET /api/history local fallback payload', () => {
  it('maps local portable session messages when backend sessions are unavailable', () => {
    const payload = buildLocalHistoryPayload('local-1', [
      {
        id: 'msg-1',
        role: 'user',
        content: 'hello local model',
        timestamp: 1234,
      },
    ])

    expect(payload).toEqual({
      sessionKey: 'local-1',
      sessionId: 'local-1',
      source: 'local',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: [{ type: 'text', text: 'hello local model' }],
          timestamp: 1234,
          historyIndex: 0,
        },
      ],
    })
  })
})
