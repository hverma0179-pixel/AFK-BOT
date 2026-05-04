const path = require('path')
const express = require('express')
const session = require('express-session')

const { Store } = require('./src/store')
const { hashPassword, verifyPassword } = require('./src/auth')
const { BotManager } = require('./src/bot-manager')

const app = express()
const port = Number(process.env.PORT || 3000)
const store = new Store(path.join(__dirname, 'data', 'app.json'))
const botManager = new BotManager({
  defaultReconnectDelayMs: Number(process.env.DEFAULT_RECONNECT_DELAY_MS || 10000),
  defaultAntiAfkIntervalMs: Number(process.env.DEFAULT_ANTI_AFK_INTERVAL_MS || 60000)
})

store.init()

function withAsync (handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}))
app.use(express.static(path.join(__dirname, 'public')))

function sanitizeServer (server) {
  const runtime = botManager.getRuntime(server.id)

  return {
    id: server.id,
    label: server.label,
    host: server.host,
    port: server.port,
    username: server.username,
    version: server.version || '',
    createdAt: server.createdAt,
    settings: server.settings,
    status: runtime ? runtime.getPublicState() : {
      connected: false,
      state: 'offline',
      lastError: null,
      reconnectAttempts: 0,
      position: null,
      health: null,
      food: null,
      dimension: null,
      lastSeenAt: null
    }
  }
}

function requireUser (req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Login required' })
  }

  const user = store.getUserById(req.session.userId)
  if (!user) {
    req.session.destroy(() => {})
    return res.status(401).json({ error: 'Session expired' })
  }

  req.user = user
  next()
}

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase()
  const password = String(req.body.password || '')

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  if (store.getUserByUsername(username)) {
    return res.status(400).json({ error: 'Username already exists.' })
  }

  const user = store.createUser({
    username,
    passwordHash: hashPassword(password)
  })

  req.session.userId = user.id
  res.json({ user: { id: user.id, username: user.username } })
})

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const user = store.getUserByUsername(username)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(400).json({ error: 'Invalid username or password.' })
  }

  req.session.userId = user.id
  res.json({ user: { id: user.id, username: user.username } })
})

app.post('/api/auth/logout', requireUser, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true })
  })
})

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null })
  }

  const user = store.getUserById(req.session.userId)
  if (!user) {
    return res.json({ user: null })
  }

  res.json({ user: { id: user.id, username: user.username } })
})

app.get('/api/servers', requireUser, (req, res) => {
  const servers = store.getServersByUserId(req.user.id).map(sanitizeServer)
  res.json({ servers })
})

app.post('/api/servers', requireUser, withAsync(async (req, res) => {
  const label = String(req.body.label || '').trim()
  const host = String(req.body.host || '').trim()
  const username = String(req.body.username || '').trim()
  const portValue = Number(req.body.port || 25565)
  const version = String(req.body.version || '').trim()

  if (!label || !host || !username) {
    return res.status(400).json({ error: 'Label, host, and bot username are required.' })
  }

  const server = store.createServer({
    userId: req.user.id,
    label,
    host,
    port: Number.isFinite(portValue) ? portValue : 25565,
    username,
    version,
    settings: {
      enabled: true,
      antiAfk: false,
      antiAfkIntervalMs: Number(process.env.DEFAULT_ANTI_AFK_INTERVAL_MS || 60000),
      autoReconnect: true,
      reconnectDelayMs: Number(process.env.DEFAULT_RECONNECT_DELAY_MS || 10000),
      chatKeepAlive: '',
      chatKeepAliveIntervalMs: 300000
    }
  })

  await botManager.ensureRunning(server)
  res.status(201).json({ server: sanitizeServer(server) })
}))

app.patch('/api/servers/:id', requireUser, withAsync(async (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  const patch = {}
  const settings = { ...server.settings }

  if (typeof req.body.label === 'string') {
    const label = req.body.label.trim()
    if (!label) return res.status(400).json({ error: 'Label cannot be empty.' })
    patch.label = label
  }
  if (typeof req.body.host === 'string') {
    const host = req.body.host.trim()
    if (!host) return res.status(400).json({ error: 'Host cannot be empty.' })
    patch.host = host
  }
  if (typeof req.body.username === 'string') {
    const username = req.body.username.trim()
    if (!username) return res.status(400).json({ error: 'Bot username cannot be empty.' })
    patch.username = username
  }
  if (req.body.port !== undefined) patch.port = Number(req.body.port) || 25565
  if (typeof req.body.version === 'string') patch.version = req.body.version.trim()

  if (typeof req.body.enabled === 'boolean') settings.enabled = req.body.enabled
  if (typeof req.body.antiAfk === 'boolean') settings.antiAfk = req.body.antiAfk
  if (req.body.antiAfkIntervalMs !== undefined) settings.antiAfkIntervalMs = Number(req.body.antiAfkIntervalMs) || settings.antiAfkIntervalMs
  if (typeof req.body.autoReconnect === 'boolean') settings.autoReconnect = req.body.autoReconnect
  if (req.body.reconnectDelayMs !== undefined) settings.reconnectDelayMs = Number(req.body.reconnectDelayMs) || settings.reconnectDelayMs
  if (typeof req.body.chatKeepAlive === 'string') settings.chatKeepAlive = req.body.chatKeepAlive
  if (req.body.chatKeepAliveIntervalMs !== undefined) settings.chatKeepAliveIntervalMs = Number(req.body.chatKeepAliveIntervalMs) || settings.chatKeepAliveIntervalMs

  patch.settings = settings

  const updated = store.updateServer(server.id, patch)

  if (updated.settings.enabled) {
    await botManager.ensureRunning(updated)
  } else {
    await botManager.stop(updated.id, 'Disabled from dashboard')
  }

  botManager.applySettings(updated)
  res.json({ server: sanitizeServer(updated) })
}))

app.delete('/api/servers/:id', requireUser, withAsync(async (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  await botManager.stop(server.id, 'Removed from dashboard')
  store.deleteServer(server.id)
  res.json({ ok: true })
}))

app.post('/api/servers/:id/actions/move', requireUser, withAsync(async (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  const runtime = botManager.getRuntime(server.id)
  if (!runtime) {
    return res.status(400).json({ error: 'Bot is not running.' })
  }

  await runtime.move(String(req.body.direction || 'forward'), Number(req.body.durationMs || 1500))
  res.json({ ok: true, status: runtime.getPublicState() })
}))

app.post('/api/servers/:id/actions/stop-move', requireUser, (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  const runtime = botManager.getRuntime(server.id)
  if (!runtime) {
    return res.status(400).json({ error: 'Bot is not running.' })
  }

  runtime.stopMoving()
  res.json({ ok: true, status: runtime.getPublicState() })
})

app.post('/api/servers/:id/actions/jump', requireUser, withAsync(async (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  const runtime = botManager.getRuntime(server.id)
  if (!runtime) {
    return res.status(400).json({ error: 'Bot is not running.' })
  }

  await runtime.jump()
  res.json({ ok: true, status: runtime.getPublicState() })
}))

app.post('/api/servers/:id/actions/chat', requireUser, (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  const runtime = botManager.getRuntime(server.id)
  if (!runtime) {
    return res.status(400).json({ error: 'Bot is not running.' })
  }

  runtime.chat(String(req.body.message || ''))
  res.json({ ok: true, status: runtime.getPublicState() })
})

app.post('/api/servers/:id/actions/break-nearest', requireUser, withAsync(async (req, res) => {
  const server = store.getServerById(req.params.id)
  if (!server || server.userId !== req.user.id) {
    return res.status(404).json({ error: 'Server not found.' })
  }

  const runtime = botManager.getRuntime(server.id)
  if (!runtime) {
    return res.status(400).json({ error: 'Bot is not running.' })
  }

  const blockName = String(req.body.blockName || '').trim()
  await runtime.breakNearest(blockName)
  res.json({ ok: true, status: runtime.getPublicState() })
}))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    botsOnline: botManager.getRunningCount(),
    users: store.getUserCount(),
    servers: store.getServerCount()
  })
})

async function bootEnabledBots () {
  const servers = store.getAllServers().filter(server => server.settings.enabled)
  for (const server of servers) {
    await botManager.ensureRunning(server)
  }
}

bootEnabledBots()
  .catch(error => {
    console.error('[boot] failed to start one or more saved bots:', error)
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`[web] control panel listening on http://localhost:${port}`)
    })
  })

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: error.message || 'Internal server error' })
})
