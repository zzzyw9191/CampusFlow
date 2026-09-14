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
  const [manageMode, setManageMode] = useState(false)

  const [selectedNotificationId, setSelectedNotificationId] =
    useState<number | null>(null)

  const [editingNotificationId, setEditingNotificationId] =
    useState<number | null>(null)

  const [lastSubmitWasEdit, setLastSubmitWasEdit] = useState(false)

  const [submitError, setSubmitError] = useState('')

  const [manageError, setManageError] = useState('')

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/health')
        const data = await response.json()

        if (!response.ok || data.status !== 'ok' || data.service !== 'CampusFlow') {
          throw new Error('后端健康检查响应异常')
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
          throw new Error('读取通知失败')
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
    setSubmitError('')

    try {
      const isEditing = editingNotificationId !== null

      const response = await fetch(
        isEditing
          ? `/api/notifications/${editingNotificationId}`
          : '/api/notifications',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, content }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '保存通知失败')
      }

      const data: Notification = await response.json()

      if (isEditing) {
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === data.id ? data : notification,
          ),
        )
      } else {
        setNotifications((prev) => [data, ...prev])
      }
      setLastSubmitWasEdit(isEditing)
      setSubmitStatus('success')
      setTitle('')
      setContent('')
      setEditingNotificationId(null)
    } catch (error) {
      setSubmitStatus('error')

      if (error instanceof Error) {
        setSubmitError(
          /[\u4e00-\u9fff]/.test(error.message)
            ? error.message
            : '保存通知失败，请稍后重试',
        )
      } else {
        setSubmitError('发生未知错误')
      }
    }
  }

  const handleDelete = async (id: number): Promise<boolean> => {
    setManageError('')

    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()

        throw new Error(errorData.error || '删除通知失败')
      }

      setNotifications((prev) =>
        prev.filter((notification) => notification.id !== id),
      )

      return true
    } catch (error) {
      if (error instanceof Error) {
        setManageError(
          /[\u4e00-\u9fff]/.test(error.message)
            ? error.message
            : '删除通知失败，请检查网络或稍后重试',
        )
      } else {
        setManageError('发生未知错误')
      }

      return false
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
                maxLength={100}
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
                maxLength={5000}
                required
              />
            </label>
          </div>
          <button type="submit" disabled={submitStatus === 'sending'}>
            {editingNotificationId === null ? '添加通知' : '保存修改'}
          </button>

          {editingNotificationId === null ? (
            (title || content) && (
              <button
                type="button"
                onClick={() => {
                  setTitle('')
                  setContent('')
                  setSubmitStatus('idle')
                  setSubmitError('')
                }}
              >
                取消添加
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingNotificationId(null)
                setTitle('')
                setContent('')
                setSubmitStatus('idle')
                setSubmitError('')
              }}
            >
              取消编辑
            </button>
          )}
          {submitStatus !== 'idle' && (
            <p className="submit-status" aria-live="polite">
              {submitStatus === 'sending' && '正在发送通知...'}
              {submitStatus === 'success' &&
                (lastSubmitWasEdit ? '通知修改成功' : '通知添加成功')}
              {submitStatus === 'error' && submitError}
            </p>
          )}
        </form>
      </section>

      <section className="panel" aria-labelledby="notice-list-heading">
        <div className="panel-header">
          <h2 id="add-notice-heading">
            {editingNotificationId === null ? '添加通知' : '编辑通知'}
          </h2>

          {!manageMode ? (
            <button
              type="button"
              onClick={() => {
                setManageError('')
                setManageMode(true)
              }}
            >
              管理通知
            </button>
          ) : (
            <div>
              <button
                type="button"
                disabled={selectedNotificationId === null}
                onClick={() => {
                  if (selectedNotificationId === null) {
                    return
                  }

                  const notification = notifications.find(
                    (item) => item.id === selectedNotificationId,
                  )

                  if (!notification) {
                    return
                  }

                  setEditingNotificationId(notification.id)
                  setTitle(notification.title)
                  setContent(notification.content)

                  setManageMode(false)
                  setSelectedNotificationId(null)
                }}
              >
                编辑
              </button>

              <button
                type="button"
                disabled={selectedNotificationId === null}
                onClick={async () => {
                  if (selectedNotificationId === null) {
                    return
                  }

                  const success = await handleDelete(selectedNotificationId)
                  if (!success) {
                    return
                  }

                  setManageMode(false)
                  setSelectedNotificationId(null)
                }}
              >
                删除
              </button>

              <button
                type="button"
                onClick={() => {
                  setManageMode(false)
                  setSelectedNotificationId(null)
                  setManageError('')
                }}
              >
                取消
              </button>
              {manageError && (
                <p className="submit-status" aria-live="polite">
                  {manageError}
                </p>
              )}
            </div>
          )}
        </div>

        {notifications.length === 0 ? (
          <p className="empty-state">暂无通知</p>
        ) : (
          <ul>
            {notifications.map((notification) => (
              <li
                key={notification.id}
                onClick={() => {
                  if (manageMode) {
                    setSelectedNotificationId(notification.id)
                  }
                }}
                className={
                  selectedNotificationId === notification.id
                    ? 'notification-selected'
                    : ''
                }
              >
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
