import Fastify from 'fastify'
import { DatabaseSync } from 'node:sqlite'

type NotificationBody = {
  title: string
  content: string
}

type NotificationParams = {
  id: string
}

const app = Fastify()

const db = new DatabaseSync('campusflow.db')

const MAX_TITLE_LENGTH = 100
const MAX_CONTENT_LENGTH = 5000

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

const deleteNotification = db.prepare(`
  DELETE FROM notifications
  WHERE id = ?
`)

const updateNotification = db.prepare(`
  UPDATE notifications
  SET title = ?, content = ?
  WHERE id = ?
`)

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'CampusFlow',
}))

app.post<{ Body: NotificationBody }>('/api/notifications', async (request, reply) => {
  const title = request.body.title.trim()
  const content = request.body.content.trim()
  if (!title || !content) {
    return reply.code(400).send({
      error: '标题和内容不能为空',
    })
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return reply.code(400).send({
      error: '标题不能超过 100 个字符',
    })
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return reply.code(400).send({
      error: '内容不能超过 5000 个字符',
    })
  }

  const result = insertNotification.run(title, content)

  return selectNotificationById.get(result.lastInsertRowid)
})

app.get('/api/notifications', async () => {
  return selectNotifications.all()
})

app.delete<{ Params: NotificationParams }>(
  '/api/notifications/:id',
  async (request, reply) => {
    const id = Number(request.params.id)

    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: '通知 ID 无效' })
    }

    const result = deleteNotification.run(id)

    if (result.changes === 0) {
      return reply.code(404).send({ error: '未找到该通知' })
    }

    return { success: true }
  },
)

app.put<{
  Params: NotificationParams
  Body: NotificationBody
}>(
  '/api/notifications/:id',
  async (request, reply) => {
    const id = Number(request.params.id)
    const title = request.body.title.trim()
    const content = request.body.content.trim()
    if (!title || !content) {
      return reply.code(400).send({
        error: '标题和内容不能为空',
      })
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return reply.code(400).send({
        error: '标题不能超过 100 个字符',
      })
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return reply.code(400).send({
        error: '内容不能超过 5000 个字符',
      })
    }

    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: '通知 ID 无效' })
    }

    const result = updateNotification.run(title, content, id)

    if (result.changes === 0) {
      return reply.code(404).send({ error: '未找到该通知' })
    }

    return selectNotificationById.get(id)
  },
)

try {
  await app.listen({ host: '127.0.0.1', port: 3001 })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
