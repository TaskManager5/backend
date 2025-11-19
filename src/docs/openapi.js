export const openapi = {
  openapi: '3.0.0',
  info: { title: 'Tasks API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/tasks': { get: { summary: 'List tasks' }, post: { summary: 'Create task' } },
    '/tasks/{id}': {
      patch: { summary: 'Update task' },
      delete: { summary: 'Delete task' },
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }]
    },
    '/teams': { get: { summary: 'List teams' } },
    '/teams/{id}/members': {
      get: { summary: 'List team members' },
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }]
    },
    '/analytics/overview': { get: { summary: 'Analytics overview' } }
  }
};
