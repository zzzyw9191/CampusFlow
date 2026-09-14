import Fastify from 'fastify'
import { DatabaseSync } from 'node:sqlite'

type NotificationBody = {
  title: string
  content: string
}

const app = Fastify()

const db = new DatabaseSync('campusflow.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

const insertNotification = db.prepare(`
  INSERT INTO notifications (title, content)
  VALUES (?, ?)
`)

const selectNotifications = db.prepare(`
  SELECT
    id,
    title,
    content,
    created_at AS createdAt
  FROM notifications
  ORDER BY id DESC
`)

const selectNotificationById = db.prepare(`
  SELECT
    id,
    title,
    content,
    created_at AS createdAt
  FROM notifications
  WHERE id = ?
`)

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'CampusFlow',
}))

app.post<{ Body: NotificationBody }>('/api/notifications', async (request) => {
  const { title, content } = request.body

  const result = insertNotification.run(title, content)

  return selectNotificationById.get(result.lastInsertRowid)
})

app.get('/api/notifications', async () => {
    return selectNotifications.all()
})

try {
  await app.listen({ host: '127.0.0.1', port: 3001 })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
