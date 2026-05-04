const state = {
  user: null,
  servers: [],
  health: null
}

const authPanel = document.getElementById('auth-panel')
const dashboard = document.getElementById('dashboard')
const botList = document.getElementById('bot-list')
const userPill = document.getElementById('user-pill')
const toast = document.getElementById('toast')
const logoutBtn = document.getElementById('logout-btn')

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

function showToast(message) {
  toast.textContent = message
  toast.classList.remove('hidden')
  setTimeout(() => toast.classList.add('hidden'), 2800)
}

function formatStatus(server) {
  const current = server.status || {}
  const position = current.position || { x: '-', y: '-', z: '-' }
  const stateName = current.state || 'offline'

  return `
    <article class="bot-card">
      <div class="bot-top">
        <div>
          <h4>${server.label}</h4>
          <p>${server.host}:${server.port} • ${server.username}</p>
        </div>
        <div class="state-pill state-${stateName}">${stateName}</div>
      </div>

      <div class="bot-meta">
        <span>Health: ${current.health ?? '-'}</span>
        <span>Food: ${current.food ?? '-'}</span>
        <span>Dimension: ${current.dimension || '-'}</span>
        <span>Reconnects: ${current.reconnectAttempts ?? 0}</span>
      </div>

      <div class="coord-grid">
        <div class="coord-box"><span>X</span><strong>${position.x}</strong></div>
        <div class="coord-box"><span>Y</span><strong>${position.y}</strong></div>
        <div class="coord-box"><span>Z</span><strong>${position.z}</strong></div>
      </div>

      <div class="control-grid">
        <div class="mini-panel">
          <h4>Movement and Actions</h4>
          <div class="action-row">
            <button data-action="move" data-direction="forward" data-id="${server.id}">Forward</button>
            <button data-action="move" data-direction="back" data-id="${server.id}">Back</button>
            <button data-action="move" data-direction="left" data-id="${server.id}">Left</button>
            <button data-action="move" data-direction="right" data-id="${server.id}">Right</button>
            <button data-action="jump" data-id="${server.id}">Jump</button>
            <button data-action="stop-move" data-id="${server.id}">Stop</button>
          </div>

          <div class="action-row" style="margin-top:12px;">
            <input data-role="chat-input" data-id="${server.id}" placeholder="chat message" />
            <button data-action="send-chat" data-id="${server.id}">Send Chat</button>
          </div>

          <div class="action-row" style="margin-top:12px;">
            <input data-role="break-input" data-id="${server.id}" placeholder="block name, ex: stone" />
            <button data-action="break-nearest" data-id="${server.id}">Break Nearest</button>
          </div>
        </div>

        <div class="mini-panel">
          <h4>Options</h4>
          <div class="toggle-row">
            <label><input type="checkbox" data-setting="enabled" data-id="${server.id}" ${server.settings.enabled ? 'checked' : ''} /> Enabled</label>
            <label><input type="checkbox" data-setting="antiAfk" data-id="${server.id}" ${server.settings.antiAfk ? 'checked' : ''} /> Anti AFK</label>
            <label><input type="checkbox" data-setting="autoReconnect" data-id="${server.id}" ${server.settings.autoReconnect ? 'checked' : ''} /> Auto reconnect</label>
          </div>

          <div class="bot-form-grid" style="margin-top:12px;">
            <input data-setting-input="chatKeepAlive" data-id="${server.id}" value="${server.settings.chatKeepAlive || ''}" placeholder="keepalive chat text" />
            <input data-setting-input="chatKeepAliveIntervalMs" data-id="${server.id}" value="${server.settings.chatKeepAliveIntervalMs || 300000}" placeholder="chat interval ms" />
            <input data-setting-input="antiAfkIntervalMs" data-id="${server.id}" value="${server.settings.antiAfkIntervalMs || 60000}" placeholder="anti afk interval ms" />
            <input data-setting-input="reconnectDelayMs" data-id="${server.id}" value="${server.settings.reconnectDelayMs || 10000}" placeholder="reconnect delay ms" />
            <button data-action="save-options" data-id="${server.id}">Save Options</button>
            <button data-action="delete-server" data-id="${server.id}">Delete Bot</button>
          </div>
        </div>
      </div>
    </article>
  `
}

function render() {
  authPanel.classList.toggle('hidden', !!state.user)
  dashboard.classList.toggle('hidden', !state.user)
  logoutBtn.classList.toggle('hidden', !state.user)

  if (!state.user) return

  userPill.textContent = `Logged in as ${state.user.username}`
  document.getElementById('stat-total').textContent = String(state.servers.length)
  document.getElementById('stat-online').textContent = String(state.servers.filter(server => server.status?.connected).length)
  document.getElementById('stat-user').textContent = String(state.health?.users || 1)
  botList.innerHTML = state.servers.map(formatStatus).join('') || '<p>No bots yet. Add a server above.</p>'
}

async function loadSession() {
  const me = await api('/api/me')
  state.user = me.user

  if (state.user) {
    const [servers, health] = await Promise.all([
      api('/api/servers'),
      api('/api/health')
    ])
    state.servers = servers.servers
    state.health = health
  }

  render()
}

document.getElementById('register-form').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const form = new FormData(event.currentTarget)
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    })
    state.user = data.user
    showToast('Account created')
    await loadSession()
  } catch (error) {
    showToast(error.message)
  }
})

document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const form = new FormData(event.currentTarget)
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    })
    state.user = data.user
    showToast('Logged in')
    await loadSession()
  } catch (error) {
    showToast(error.message)
  }
})

document.getElementById('server-form').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())

    await api('/api/servers', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    event.currentTarget.reset()
    event.currentTarget.port.value = '25565'
    showToast('Bot deployed')
    await loadSession()
  } catch (error) {
    showToast(error.message)
  }
})

logoutBtn.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' })
  state.user = null
  state.servers = []
  render()
})

document.getElementById('refresh-btn').addEventListener('click', loadSession)

botList.addEventListener('click', async event => {
  const button = event.target.closest('button')
  if (!button) return

  const id = button.dataset.id
  const action = button.dataset.action

  try {
    if (action === 'move') {
      await api(`/api/servers/${id}/actions/move`, {
        method: 'POST',
        body: JSON.stringify({ direction: button.dataset.direction, durationMs: 1600 })
      })
    } else if (action === 'jump') {
      await api(`/api/servers/${id}/actions/jump`, { method: 'POST' })
    } else if (action === 'stop-move') {
      await api(`/api/servers/${id}/actions/stop-move`, { method: 'POST' })
    } else if (action === 'send-chat') {
      const input = document.querySelector(`[data-role="chat-input"][data-id="${id}"]`)
      await api(`/api/servers/${id}/actions/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: input.value })
      })
      input.value = ''
    } else if (action === 'break-nearest') {
      const input = document.querySelector(`[data-role="break-input"][data-id="${id}"]`)
      await api(`/api/servers/${id}/actions/break-nearest`, {
        method: 'POST',
        body: JSON.stringify({ blockName: input.value })
      })
    } else if (action === 'save-options') {
      const payload = {
        chatKeepAlive: document.querySelector(`[data-setting-input="chatKeepAlive"][data-id="${id}"]`).value,
        chatKeepAliveIntervalMs: Number(document.querySelector(`[data-setting-input="chatKeepAliveIntervalMs"][data-id="${id}"]`).value || 300000),
        antiAfkIntervalMs: Number(document.querySelector(`[data-setting-input="antiAfkIntervalMs"][data-id="${id}"]`).value || 60000),
        reconnectDelayMs: Number(document.querySelector(`[data-setting-input="reconnectDelayMs"][data-id="${id}"]`).value || 10000)
      }

      await api(`/api/servers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      })
    } else if (action === 'delete-server') {
      await api(`/api/servers/${id}`, { method: 'DELETE' })
    }

    showToast('Updated')
    await loadSession()
  } catch (error) {
    showToast(error.message)
  }
})

botList.addEventListener('change', async event => {
  const input = event.target
  if (!input.dataset.setting) return

  const payload = {
    [input.dataset.setting]: input.checked
  }

  try {
    await api(`/api/servers/${input.dataset.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
    await loadSession()
  } catch (error) {
    showToast(error.message)
  }
})

setInterval(() => {
  if (state.user) loadSession().catch(() => {})
}, 5000)

loadSession().catch(error => {
  showToast(error.message)
})
