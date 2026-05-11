import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { buildAgentRegistryApiPayload, loadAgentRegistry } from '../../server/agent-registry'

export const Route = createFileRoute('/api/agent-registry')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json(buildAgentRegistryApiPayload(loadAgentRegistry()))
      },
      HEAD: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(null, { status: 401 })
        }
        return new Response(null, { status: 204 })
      },
    },
  },
})
