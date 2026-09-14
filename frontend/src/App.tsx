import { type FormEvent, useEffect, useState } from 'react'
import './App.css'

type BackendStatus = 'checking' | 'online' | 'offline'
type SubmitStatus = 'idle' | 'sending' | 'success' | 'error'
type Notification = {
  id: number
  title: string
  content: string
  createdAt: string
}

const formatCreatedAt = (createdAt: string) => {
  const date = new Date(createdAt.replace(' ', 'T') + 'Z')

  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

const statusText: Record<BackendStatus, string> = {
  checking: '正在检查后端连接...',
  online: '后端连接正常',
  offline: '后端连接失败',
}

function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/health')
        const data = await response.json()

        if (!response.ok || data.status !== 'ok' || data.service !== 'CampusFlow') {
          throw new Error('Unexpected health check response')
        }

        setBackendStatus('online')
      } catch {
        setBackendStatus('offline')
      }
    }

    const loadNotifications = async () => {
  try {
    const response = await fetch('/api/notifications')

    if (!response.ok) {
      throw new Error('Failed to load notifications')
    }

    const data: Notification[] = await response.json()
    setNotifications(data)
  } catch {
    setNotifications([])
  }
}

    void checkBackend()
    void loadNotifications()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitStatus('sending')

    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      const data = await response.json()

    if (!response.ok || data.title !== title || data.content !== content) {
      throw new Error('Unexpected notification response')
    }

    setSubmitStatus('success')
    setNotifications((prev) => [data, ...prev])
    setTitle('')
    setContent('')
    } catch {
      setSubmitStatus('error')
    }
  }

  return (
    <main className="campus-flow">
      <header className="page-header">
        <h1>CampusFlow</h1>
        <p>Personal Campus Information Hub</p>
      </header>

      <section className="connection-status" aria-live="polite">
        <strong>后端状态</strong>
        <span>{statusText[backendStatus]}</span>
      </section>

      <section className="panel" aria-labelledby="add-notice-heading">
        <h2 id="add-notice-heading">添加通知</h2>
        <form onSubmit={handleSubmit}>
          <div className="notice-fields">
            <label htmlFor="notice-title">
              标题
              <input
                id="notice-title"
                name="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="输入通知标题"
                required
              />
            </label>
            <label htmlFor="notice-content">
              内容
              <textarea
                id="notice-content"
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="输入通知内容"
                required
              />
            </label>
          </div>
          <button type="submit" disabled={submitStatus === 'sending'}>
            添加通知
          </button>
          {submitStatus !== 'idle' && (
            <p className="submit-status" aria-live="polite">
              {submitStatus === 'sending' && '正在发送通知...'}
              {submitStatus === 'success' && '通知发送成功'}
              {submitStatus === 'error' && '通知发送失败'}
            </p>
          )}
        </form>
      </section>

      <section className="panel" aria-labelledby="notice-list-heading">
        <h2 id="notice-list-heading">通知列表</h2>

        {notifications.length === 0 ? (
  <p className="empty-state">暂无通知</p>
) : (
  <ul>
    {notifications.map((notification) => (
      <li key={notification.id}>
        <strong>{notification.title}</strong>
        <p>{notification.content}</p>
        <small>{formatCreatedAt(notification.createdAt)}</small>
      </li>
    ))}
  </ul>
)}
      </section>
    </main>
  )
}

export default App
