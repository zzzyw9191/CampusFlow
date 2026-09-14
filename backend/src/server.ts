import Fastify from 'fastify'

type NotificationBody = {
  title: string
  content: string
}

const app = Fastify()
const notifications: NotificationBody[] = []

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'CampusFlow',
}))

app.post<{ Body: NotificationBody }>('/api/notifications', async (request) => {
    notifications.push(request.body)
    return request.body
})

app.get('/api/notifications', async () => {
    return notifications
})

try {
  await app.listen({ host: '127.0.0.1', port: 3001 })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
