import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from './app.mjs'

const port = Number(process.env.PORT ?? 8787)
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

const { server, admin } = createApp({ dbPath: join(dataDir, 'support.db'), adminWallet: process.env.ADMIN_WALLET ?? '' })
if (!admin) console.warn('ADMIN_WALLET is not set or is not a valid address: the admin panel is disabled.')

server.listen(port, '0.0.0.0', () => console.log(`GiftFlowPay support API on :${port}${admin ? `, admin ${admin}` : ''}`))
const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
