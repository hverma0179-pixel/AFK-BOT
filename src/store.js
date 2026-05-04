const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

class Store {
  constructor(filePath) {
    this.filePath = filePath
    this.state = {
      users: [],
      servers: []
    }
  }

  init() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })

    if (!fs.existsSync(this.filePath)) {
      this.persist()
      return
    }

    const raw = fs.readFileSync(this.filePath, 'utf8')
    this.state = JSON.parse(raw || '{"users":[],"servers":[]}')
  }

  persist() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2))
  }

  getUserCount() {
    return this.state.users.length
  }

  getServerCount() {
    return this.state.servers.length
  }

  getUserById(id) {
    return this.state.users.find(user => user.id === id) || null
  }

  getUserByUsername(username) {
    return this.state.users.find(user => user.username === username) || null
  }

  createUser(payload) {
    const user = {
      id: crypto.randomUUID(),
      username: payload.username,
      passwordHash: payload.passwordHash,
      createdAt: new Date().toISOString()
    }

    this.state.users.push(user)
    this.persist()
    return user
  }

  getAllServers() {
    return [...this.state.servers]
  }

  getServersByUserId(userId) {
    return this.state.servers.filter(server => server.userId === userId)
  }

  getServerById(id) {
    return this.state.servers.find(server => server.id === id) || null
  }

  createServer(payload) {
    const server = {
      id: crypto.randomUUID(),
      userId: payload.userId,
      label: payload.label,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      version: payload.version,
      settings: payload.settings,
      createdAt: new Date().toISOString()
    }

    this.state.servers.push(server)
    this.persist()
    return server
  }

  updateServer(id, patch) {
    const server = this.getServerById(id)
    if (!server) return null

    Object.assign(server, patch)
    this.persist()
    return server
  }

  deleteServer(id) {
    this.state.servers = this.state.servers.filter(server => server.id !== id)
    this.persist()
  }
}

module.exports = {
  Store
}
