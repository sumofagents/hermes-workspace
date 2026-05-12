import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getVectorMemoryStatus } from '../../../server/vector-memory'

export const Route = createFileRoute('/api/vector-memory/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          return json(await getVectorMemoryStatus())
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to read vector memory status',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
