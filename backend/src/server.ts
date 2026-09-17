import { fileURLToPath } from 'node:url'
import { createServer } from './app.js'

try {
  // backend/src and frontend/dist are in separate directories.
  const databasePath = fileURLToPath(new URL('../campusflow.db', import.meta.url))
  const staticDir = fileURLToPath(
  new URL('../../frontend/dist', import.meta.url)
  )

  const app = createServer({
    databasePath,
    staticDir,
  })

  try {
    await app.listen({ host: '127.0.0.1', port: 3001 })
  } catch (error) {
    await app.close()
    throw error
  }

  const shutdown = async () => {
    try {
      await app.close()
    } catch (error) {
      console.error(error)
      process.exitCode = 1
    }
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error(error)
  process.exit(1)
}
