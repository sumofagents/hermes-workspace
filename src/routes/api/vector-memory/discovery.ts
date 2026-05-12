import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/vector-memory/discovery')({
  server: {
    handlers: {
      POST: async () =>
        json(
          {
            error:
              'Vector memory writes are disabled in the read-only Workspace dashboard phase.',
          },
          { status: 405 },
        ),
    },
  },
})
