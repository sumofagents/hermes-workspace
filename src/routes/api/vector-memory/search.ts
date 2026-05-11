import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  VectorMemoryInputError,
  searchVectorMemory,
} from '../../../server/vector-memory'

export const Route = createFileRoute('/api/vector-memory/search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json().catch(() => ({}))) as {
            query?: unknown
            collection?: unknown
            limit?: unknown
          }
          if (typeof body.query !== 'string') {
            return json({ error: 'Query is required' }, { status: 400 })
          }
          if (
            body.collection !== undefined &&
            typeof body.collection !== 'string'
          ) {
            return json({ error: 'Collection must be a string' }, { status: 400 })
          }
          if (body.limit !== undefined && typeof body.limit !== 'number') {
            return json({ error: 'Limit must be a number' }, { status: 400 })
          }
          const collection =
            typeof body.collection === 'string' ? body.collection : 'all'
          const limit = typeof body.limit === 'number' ? body.limit : undefined
          return json(
            await searchVectorMemory({
              query: body.query,
              collection,
              limit,
            }),
          )
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search vector memory',
            },
            { status: error instanceof VectorMemoryInputError ? 400 : 500 },
          )
        }
      },
    },
  },
})
