const mineflayer = require('mineflayer')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class BotRuntime {
  constructor(server, defaults) {
    this.server = server
    this.defaults = defaults
    this.bot = null
    this.reconnectTimer = null
    this.antiAfkTimer = null
    this.chatTimer = null
    this.moveTimer = null
    this.state = {
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

  get reconnectDelayMs() {
    return this.server.settings.reconnectDelayMs || this.defaults.defaultReconnectDelayMs
  }

  get antiAfkIntervalMs() {
    return this.server.settings.antiAfkIntervalMs || this.defaults.defaultAntiAfkIntervalMs
  }

  getPublicState() {
    return {
      ...this.state
    }
  }

  async start() {
    if (this.bot || !this.server.settings.enabled) return

    this.state.state = 'connecting'
    this.bot = mineflayer.createBot({
      host: this.server.host,
      port: this.server.port,
      username: this.server.username,
      version: this.server.version || false,
      auth: 'offline',
      viewDistance: 'tiny'
    })

    this.attachListeners()
  }

  attachListeners() {
    this.bot.on('login', () => {
      this.state.connected = true
      this.state.state = 'online'
      this.state.lastError = null
      this.state.reconnectAttempts = 0
      this.state.lastSeenAt = new Date().toISOString()
      this.syncState()
      this.applySettings()
    })

    this.bot.on('spawn', () => {
      this.syncState()
      this.applySettings()
    })

    this.bot.on('physicsTick', () => {
      this.syncState()
    })

    this.bot.on('end', reason => {
      this.cleanupIntervals()
      this.bot = null
      this.state.connected = false
      this.state.state = 'offline'
      this.state.lastError = reason || this.state.lastError
      this.scheduleReconnect()
    })

    this.bot.on('kicked', reason => {
      this.state.lastError = typeof reason === 'string' ? reason : JSON.stringify(reason)
      this.state.state = 'kicked'
    })

    this.bot.on('error', error => {
      this.state.lastError = error.message
      this.state.state = 'error'
    })
  }

  syncState() {
    if (!this.bot || !this.bot.entity) return

    const position = this.bot.entity.position
    this.state.position = {
      x: Number(position.x.toFixed(2)),
      y: Number(position.y.toFixed(2)),
      z: Number(position.z.toFixed(2))
    }
    this.state.health = this.bot.health
    this.state.food = this.bot.food
    this.state.dimension = this.bot.game ? this.bot.game.dimension : null
    this.state.lastSeenAt = new Date().toISOString()
  }

  scheduleReconnect() {
    if (!this.server.settings.enabled || !this.server.settings.autoReconnect || this.reconnectTimer) return

    this.state.state = 'reconnecting'
    this.state.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      await this.start()
    }, this.reconnectDelayMs)
  }

  applySettings() {
    this.cleanupIntervals(false)

    if (!this.bot) return

    if (this.server.settings.antiAfk) {
      this.antiAfkTimer = setInterval(() => {
        if (!this.bot) return

        this.bot.setControlState('jump', true)
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('jump', false)
        }, 450)
      }, this.antiAfkIntervalMs)
    }

    if (this.server.settings.chatKeepAlive) {
      this.chatTimer = setInterval(() => {
        if (!this.bot) return
        this.bot.chat(this.server.settings.chatKeepAlive)
      }, this.server.settings.chatKeepAliveIntervalMs || 300000)
    }
  }

  async move(direction, durationMs) {
    if (!this.bot) throw new Error('Bot not connected')

    this.stopMoving()
    const safeDirection = ['forward', 'back', 'left', 'right'].includes(direction) ? direction : 'forward'
    this.bot.setControlState(safeDirection, true)
    this.state.state = `moving-${safeDirection}`
    this.moveTimer = setTimeout(() => {
      if (this.bot) {
        this.bot.setControlState(safeDirection, false)
        this.state.state = this.state.connected ? 'online' : 'offline'
      }
      this.moveTimer = null
    }, Math.max(250, Number(durationMs || 1500)))
  }

  stopMoving() {
    if (this.moveTimer) {
      clearTimeout(this.moveTimer)
      this.moveTimer = null
    }

    if (!this.bot) return

    for (const control of ['forward', 'back', 'left', 'right', 'jump']) {
      this.bot.setControlState(control, false)
    }

    this.state.state = this.state.connected ? 'online' : 'offline'
  }

  async jump() {
    if (!this.bot) throw new Error('Bot not connected')

    this.bot.setControlState('jump', true)
    await wait(500)
    if (this.bot) {
      this.bot.setControlState('jump', false)
    }
  }

  chat(message) {
    if (!this.bot || !message) return
    this.bot.chat(message)
  }

  async breakNearest(blockName) {
    if (!this.bot) throw new Error('Bot not connected')

    const block = this.bot.findBlock({
      matching: candidate => {
        if (!candidate || !candidate.diggable) return false
        if (!blockName) return true
        return candidate.name.includes(blockName)
      },
      maxDistance: 4
    })

    if (!block) {
      throw new Error('No matching diggable block found nearby')
    }

    await this.bot.dig(block)
  }

  cleanupIntervals(clearReconnect = true) {
    if (clearReconnect && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.antiAfkTimer) {
      clearInterval(this.antiAfkTimer)
      this.antiAfkTimer = null
    }

    if (this.chatTimer) {
      clearInterval(this.chatTimer)
      this.chatTimer = null
    }

    if (this.moveTimer) {
      clearTimeout(this.moveTimer)
      this.moveTimer = null
    }
  }

  async stop(reason) {
    this.cleanupIntervals()
    this.state.connected = false
    this.state.state = 'offline'
    this.state.lastError = reason || this.state.lastError

    if (this.bot) {
      const currentBot = this.bot
      this.bot = null
      try {
        currentBot.quit(reason || 'Stopped')
      } catch {
      }
    }
  }
}

class BotManager {
  constructor(defaults) {
    this.defaults = defaults
    this.runtimes = new Map()
  }

  getRuntime(serverId) {
    return this.runtimes.get(serverId) || null
  }

  getRunningCount() {
    let count = 0
    for (const runtime of this.runtimes.values()) {
      if (runtime.state.connected) count += 1
    }
    return count
  }

  async ensureRunning(server) {
    let runtime = this.runtimes.get(server.id)

    if (!runtime) {
      runtime = new BotRuntime(server, this.defaults)
      this.runtimes.set(server.id, runtime)
    } else {
      runtime.server = server
    }

    if (server.settings.enabled) {
      await runtime.start()
      runtime.applySettings()
    }

    return runtime
  }

  applySettings(server) {
    const runtime = this.runtimes.get(server.id)
    if (!runtime) return

    runtime.server = server
    runtime.applySettings()
  }

  async stop(serverId, reason) {
    const runtime = this.runtimes.get(serverId)
    if (!runtime) return

    await runtime.stop(reason)
    this.runtimes.delete(serverId)
  }
}

module.exports = {
  BotManager
}
