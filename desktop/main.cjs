const { app, BrowserWindow } = require('electron')

// 安装/卸载事件由官方模块处理快捷方式并退出，不启动 Fastify 或窗口。
if (require('electron-squirrel-startup')) return

const path = require('node:path')
const { pathToFileURL } = require('node:url')

// 显示名称可以改变，数据目录保持与 0.4-D 一致，不迁移或复制数据库。
app.setPath('userData', path.join(app.getPath('appData'), 'campusflow-desktop'))
if (process.platform === 'win32') {
  app.setAppUserModelId('com.squirrel.CampusFlow.CampusFlow')
}

let fastifyApp
let isQuitting = false
let exitCode = 0

function getRuntimePaths() {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')

  return {
    backendPath: path.join(resourceRoot, 'backend/dist/app.js'),
    databasePath: path.join(app.getPath('userData'), 'campusflow.db'),
    qqSourceConfigPath: path.join(app.getPath('userData'), 'qq-source.local.json'),
    staticDir: path.join(resourceRoot, 'frontend/dist'),
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
  })

  window.loadURL('http://127.0.0.1:3001')
}

const startup = app.whenReady().then(async () => {
  const { backendPath, databasePath, qqSourceConfigPath, staticDir } = getRuntimePaths()
  console.info('CampusFlow 后端路径：', backendPath)
  console.info('CampusFlow 数据库路径：', databasePath)
  console.info('CampusFlow 静态资源路径：', staticDir)
  const backendUrl = pathToFileURL(backendPath)
  const { createServer } = await import(backendUrl.href)

  if (isQuitting) return

  fastifyApp = createServer({
    databasePath,
    qqSourceConfigPath,
    staticDir,
  })

  await fastifyApp.listen({ host: '127.0.0.1', port: 3001 })

  if (!isQuitting) createWindow()

  app.on('activate', () => {
    if (!isQuitting && BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch((error) => {
  console.error('CampusFlow 桌面应用启动失败：', error)
  exitCode = 1
  app.quit()
})

app.on('before-quit', (event) => {
  event.preventDefault()
  if (isQuitting) return
  isQuitting = true

  // 等启动流程结束后再关闭，避免 listen 与 close 同时执行。
  void (async () => {
    await startup
    try {
      if (fastifyApp) await fastifyApp.close()
    } catch (error) {
      console.error('CampusFlow 后端关闭失败：', error)
      exitCode = 1
    } finally {
      // 资源已释放；exit 不会再次触发 before-quit。
      app.exit(exitCode)
    }
  })()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
