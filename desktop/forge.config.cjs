const path = require('node:path')

module.exports = {
  packagerConfig: {
    name: 'CampusFlow',
    executableName: 'CampusFlow',
    asar: true,
    extraResource: [
      path.join(__dirname, '.runtime/backend'),
      path.join(__dirname, '.runtime/frontend'),
    ],
    // Forge 自动剔除 devDependencies；保留 Squirrel 启动模块的生产依赖。
    ignore: (filePath) => filePath === '/node_modules/.bin'
      || filePath.startsWith('/node_modules/.bin/')
      || filePath === '/node_modules/.package-lock.json'
      || (filePath !== ''
      && !['/main.cjs', '/package.json', '/node_modules'].includes(filePath)
      && !filePath.startsWith('/node_modules/')),
  },
  makers: [{
    name: '@electron-forge/maker-squirrel',
    config: {
      name: 'CampusFlow',
      setupExe: 'CampusFlow Setup.exe',
      noMsi: true,
    },
  }],
}
