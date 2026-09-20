# CampusFlow

**CampusFlow — Personal Campus Information Hub / 个人校园信息中枢**

CampusFlow 面向大学生，用于统一接入和整理分散在 QQ 群、学校通知、课程通知、文件和手动输入中的校园信息。长期目标是把这些信息经过筛选、去重、解析和结构化处理，沉淀为可搜索、可管理、可提醒的信息系统。

```text
QQ / 学校通知 / 文件 / 手动输入
                ↓
           Raw Message
                ↓
         筛选 / 去重 / 解析
                ↓
       Notification / Task / Event
                ↓
            Database
                ↓
        Search / Reminder / UI
```

> 当前 CampusFlow 0.5 尚未实现 AI Parser、自动任务提取或提醒系统。上图中的解析、结构化、搜索和提醒属于后续方向。

## 当前状态

当前版本：**CampusFlow 0.5**

目前已经实现：

- React + TypeScript 前端；
- Fastify + TypeScript 后端；
- SQLite 本地数据库；
- 通知基础 CRUD；
- Fastify 托管前端构建产物；
- Electron 桌面端集成与 Windows 安装包构建；
- NapCat / OneBot 11 QQ 信息源接入；
- 通过 WebSocket 自动接收 QQ 群消息；
- WebSocket 断线重连；
- QQ 群白名单来源筛选；
- RawMessage 原始消息模型；
- QQ 群消息持久化到 SQLite；
- 基于 `(source, source_message_id)` 唯一约束的消息去重；
- 白名单配置异常时 fail-closed。

> CampusFlow 0.5 已经打通第一个真实外部信息源，从 QQ 群消息接入、来源筛选，到 RawMessage 持久化和去重形成完整链路。

## 当前架构

QQ 信息源链路：

```text
QQ
 ↓
NapCat / OneBot 11
 ↓ WebSocket
QQ Source
 ↓
Group Whitelist
 ↓
RawMessage
 ↓
SQLite
```

Web 应用链路：

```text
React Frontend
      ↕ /api
Fastify Backend
      ↕
    SQLite
```

桌面端关系：

```text
Electron
   ↓
Fastify + React
   ↓
SQLite
```

## 技术栈

### Frontend

- React
- TypeScript
- Vite

### Backend

- Node.js
- Fastify
- TypeScript
- SQLite

### Desktop

- Electron
- Electron Forge

### QQ Source

- NapCat
- OneBot 11
- WebSocket

## QQ Source 配置

使用 QQ Source 前，需要先启动并登录 NapCat，并提供 OneBot 11 正向 WebSocket 服务。CampusFlow 默认连接 `ws://127.0.0.1:3002`。

开发环境的实际配置文件为 `backend/qq-source.local.json`。仓库提供 `backend/qq-source.example.json` 作为模板：

```json
{
  "allowedGroupIds": ["123456789"]
}
```

示例群号仅为虚构占位值。配置时请注意：

- 群号按字符串处理；
- 只有显式加入 `allowedGroupIds` 的群消息才会进入 RawMessage 持久化流程；
- 实际 `backend/qq-source.local.json` 已被 `.gitignore` 忽略，不应提交到 Git；
- 桌面端配置文件位于 Electron `app.getPath('userData')` 对应目录，文件名同样为 `qq-source.local.json`；
- 白名单为空、配置不存在、JSON 损坏或配置非法时，系统采用 fail-closed：**拒绝所有 QQ 群消息，而不是接收全部群。**

## 本地运行

需要预先安装 Node.js 和 npm，并分别安装各目录依赖：

```sh
cd frontend
npm install

cd ../backend
npm install

cd ../desktop
npm install
```

### 前端与后端开发运行

后端当前会校验前端构建产物，因此首次运行前先构建前端：

```sh
cd frontend
npm run build
```

终端一启动后端，监听 `http://127.0.0.1:3001`：

```sh
cd backend
npm run dev
```

终端二启动 Vite 前端开发服务器：

```sh
cd frontend
npm run dev
```

前端通过 Vite 代理将 `/api` 请求转发到 Fastify 后端。

常用检查和构建命令：

```sh
cd frontend
npm run lint
npm run build

cd ../backend
npm run typecheck
npm run build
```

### Electron 桌面端

桌面端脚本会先构建前端和后端：

```sh
cd desktop
npm run start
```

生成 Windows 打包目录：

```sh
npm run package
```

生成 Windows 安装包：

```sh
npm run make
```

## 项目结构

```text
CampusFlow/
├─ frontend/                 # React 前端
├─ backend/                  # Fastify 后端
│  ├─ qq-source.example.json
│  └─ src/
│     ├─ config/             # 本地配置加载
│     ├─ data/               # SQLite repository
│     └─ sources/
│        └─ qq/              # NapCat / OneBot QQ Source
├─ desktop/                  # Electron 桌面端与打包配置
└─ README.md
```

## 当前版本边界

CampusFlow 0.5 当前只完成 QQ 群消息的原始接入、白名单筛选、持久化和去重：

- 不处理 QQ 私聊消息；
- 尚未将 RawMessage 自动转换为 Notification、Task 或 Event；
- 尚未实现 AI Parser、关键词过滤、自动任务提取、搜索或提醒；
- 学校通知、文件和手动输入等其他来源尚未接入；
- QQ 白名单仍通过本地 JSON 手动配置。

## Roadmap

- `0.5`：QQ 信息源接入、RawMessage 持久化和来源筛选 ✅
- 下一阶段：RawMessage 处理、Parser 与结构化校园信息
- 后续方向：AI Parser、Task / Notification / Event、搜索与提醒、多来源接入
