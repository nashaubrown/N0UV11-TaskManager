import { createServer } from 'node:http'
import { createApp } from './app.js'
import { config } from './lib/config.js'
import { attachWebSocket } from './ws/hub.js'
import { startSyncWorker } from './services/gcal.js'

const server = createServer(createApp())
attachWebSocket(server)
startSyncWorker()

server.listen(config.port, () => {
  console.log(`NOUVII API listening on http://localhost:${config.port}`)
  console.log(`Docs: http://localhost:${config.port}/api/docs · WS: ws://localhost:${config.port}/ws`)
})
