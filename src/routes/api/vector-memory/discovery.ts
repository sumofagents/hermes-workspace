import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  VectorMemoryInputError,
  storeTeamDiscovery,
} from '../../../server/vector-memory'

export const Route = createFileRoute('/api/vector-memory/discovery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireJsonContentType(request)
        if (contentTypeError) return contentTypeError
        try {
          const body = (await request.json().catch(() => ({}))) as {
            content?: unknown
            source?: unknown
          }
          if (typeof body.content !== 'string') {
            return json({ error: 'Discovery content is required' }, { status: 400 })
          }
          if (body.source !== undefined && typeof body.source !== 'string') {
            return json({ error: 'Source must be a string' }, { status: 400 })
          }
          const source =
            typeof body.source === 'string' ? body.source : 'workspace-dashboard'
          return json(
            await storeTeamDiscovery({
              content: body.content,
              source,
            }),
          )
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to store team discovery',
            },
            { status: error instanceof VectorMemoryInputError ? 400 : 500 },
          )
        }
      },
    },
  },
})
