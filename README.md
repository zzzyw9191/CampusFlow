# CampusFlow 0.1

CampusFlow / Personal Campus Information Hub：面向大学生的个人校园信息管理软件，0.1 已完成通知提交与展示的基础前后端流程。

## 技术栈与项目结构

- `frontend/`：React + TypeScript + Vite
- `backend/`：Fastify + TypeScript

## 已实现功能

- 前后端项目结构。
- `GET /api/health`：健康检查，前端显示后端连接状态。
- `POST /api/notifications`：接收通知并保存在后端内存中。
- `GET /api/notifications`：读取通知列表。
- 通知标题、内容表单，页面启动时自动读取通知。
- 新通知提交成功后立即加入当前页面列表，并清空输入框。

## 本地运行

安装 Node.js 和 npm 后，在项目根目录打开两个终端。

终端一：启动后端（`http://127.0.0.1:3001`）。

```sh
cd backend
npm install
npm run dev
```

终端二：启动前端。

```sh
cd frontend
npm install
npm run dev
```

打开 Vite 输出的本地地址；前端通过 Vite 代理将 `/api` 请求转发至后端。运行期间需保持两个终端开启。

检查命令：在 `frontend/` 中运行 `npm run lint`、`npm run build`；在 `backend/` 中运行 `npm run typecheck`。

## 当前限制与下一步

- 通知仍保存在 Node.js 内存中，后端进程关闭后数据会丢失。
- 0.2 将接入 SQLite，实现数据持久化。
