const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const desktopDir = path.resolve(__dirname, '..')
const projectDir = path.resolve(desktopDir, '..')
const runtimeDir = path.join(desktopDir, '.runtime')

// 只清理本脚本生成的暂存目录，不操作源码、开发依赖或数据库。
if (path.dirname(runtimeDir) !== desktopDir || path.basename(runtimeDir) !== '.runtime') {
  throw new Error('无效的打包暂存目录')
}
fs.rmSync(runtimeDir, { recursive: true, force: true })
fs.mkdirSync(path.join(runtimeDir, 'backend'), { recursive: true })

for (const file of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(projectDir, 'backend', file), path.join(runtimeDir, 'backend', file))
}
fs.cpSync(path.join(projectDir, 'backend/dist'), path.join(runtimeDir, 'backend/dist'), {
  recursive: true,
})
fs.cpSync(path.join(projectDir, 'frontend/dist'), path.join(runtimeDir, 'frontend/dist'), {
  recursive: true,
})

// 使用后端自己的锁文件安装生产依赖，避免复制开发用 node_modules。
if (!process.env.npm_execpath) throw new Error('请通过 npm run package 执行打包')
execFileSync(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: path.join(runtimeDir, 'backend'),
  stdio: 'inherit',
})
