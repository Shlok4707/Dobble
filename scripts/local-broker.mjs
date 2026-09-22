/**
 * Optional self-hosted matchmaking, for locked-down networks or if you would
 * rather not depend on public services.
 *
 *   node scripts/local-broker.mjs
 *
 * Starts BOTH:
 *   - a PeerJS broker on :9000  (introduces the two browsers for WebRTC)
 *   - an MQTT-over-WebSocket relay on :9001  (carries messages directly)
 *
 * Point the app at them with a .env file:
 *   VITE_PEER_HOST=<this machine's LAN IP>
 *   VITE_PEER_PORT=9000
 *   VITE_PEER_SECURE=false
 *   VITE_RELAY_URL=ws://<this machine's LAN IP>:9001/mqtt
 */
import { createServer } from 'node:http'
import { PeerServer } from 'peer'
import { Aedes } from 'aedes'
import { WebSocketServer, createWebSocketStream } from 'ws'

const PEER_PORT = Number(process.env.PEER_PORT || 9000)
const RELAY_PORT = Number(process.env.RELAY_PORT || 9001)

PeerServer({ port: PEER_PORT, path: '/', key: 'peerjs', host: '0.0.0.0' }, () => {
  console.log(`PeerJS broker   : ws://0.0.0.0:${PEER_PORT}`)
})

const aedes = await Aedes.createBroker()
const httpServer = createServer()
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (socket) => {
  const stream = createWebSocketStream(socket, { objectMode: false })
  aedes.handle(stream)
})

httpServer.listen(RELAY_PORT, '0.0.0.0', () => {
  console.log(`MQTT relay      : ws://0.0.0.0:${RELAY_PORT}/mqtt`)
})
