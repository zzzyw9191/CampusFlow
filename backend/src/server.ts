import Fastify from 'fastify'

const app = Fastify()

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'CampusFlow',
}))

try {
  await app.listen({ host: '127.0.0.1', port: 3001 })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
