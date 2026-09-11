import { useEffect, useState } from 'react'
import './App.css'

type BackendStatus = 'checking' | 'online' | 'offline'

const statusText: Record<BackendStatus, string> = {
  checking: '正在检查后端连接...',
  online: '后端连接正常',
  offline: '后端连接失败',
}

function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking')

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

    void checkBackend()
  }, [])

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
        <div className="notice-fields">
          <label htmlFor="notice-title">
            标题
            <input id="notice-title" name="title" type="text" placeholder="输入通知标题" />
          </label>
          <label htmlFor="notice-course">
            课程
            <input id="notice-course" name="course" type="text" placeholder="输入课程名称" />
          </label>
          <label htmlFor="notice-deadline">
            截止日期
            <input id="notice-deadline" name="deadline" type="date" />
          </label>
        </div>
        {/* 0.1-A 只展示界面，按钮暂不绑定事件。 */}
        <button type="button">添加通知</button>
      </section>

      <section className="panel" aria-labelledby="notice-list-heading">
        <h2 id="notice-list-heading">通知列表</h2>
        <p className="empty-state">暂无通知</p>
      </section>
    </main>
  )
}

export default App
