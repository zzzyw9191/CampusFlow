import './App.css'

function App() {
  return (
    <main className="campus-flow">
      <header className="page-header">
        <h1>CampusFlow</h1>
        <p>Personal Campus Information Hub</p>
      </header>

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
