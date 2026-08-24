const els = {
  loginCard: document.querySelector('#loginCard'),
  dashboard: document.querySelector('#dashboard'),
  pinInput: document.querySelector('#pinInput'),
  rememberDevice: document.querySelector('#rememberDevice'),
  connectButton: document.querySelector('#connectButton'),
  forgetButton: document.querySelector('#forgetButton'),
  statusPill: document.querySelector('#statusPill'),
  targetSelect: document.querySelector('#targetSelect'),
  refreshButton: document.querySelector('#refreshButton'),
  streamButton: document.querySelector('#streamButton'),
  streamState: document.querySelector('#streamState'),
  recordButton: document.querySelector('#recordButton'),
  recordState: document.querySelector('#recordState'),
  buildScenesButton: document.querySelector('#buildScenesButton'),
  sceneGrid: document.querySelector('#sceneGrid'),
  sceneCount: document.querySelector('#sceneCount'),
  audioGrid: document.querySelector('#audioGrid'),
  audioCount: document.querySelector('#audioCount'),
  toast: document.querySelector('#toast')
};

let config = { pinRequired: false, targets: [] };
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let state = {
  currentScene: '',
  scenes: [],
  audioInputs: [],
  streaming: false,
  recording: false,
  connected: false
};

const STORAGE = {
  pin: 'obsremote-pin',
  target: 'obsremote-target',
  remember: 'obsremote-remember'
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2400);
}

function setStatus(connected, label = connected ? 'Connected' : 'Offline') {
  state.connected = connected;
  els.statusPill.classList.toggle('online', connected);
  els.statusPill.classList.toggle('offline', !connected);
  els.statusPill.querySelector('strong').textContent = label;
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    toast('Remote is not connected');
    return;
  }
  socket.send(JSON.stringify(payload));
}

function renderScenes() {
  els.sceneCount.textContent = String(state.scenes.length);
  els.sceneGrid.replaceChildren(...state.scenes.map((sceneName) => {
    const button = document.createElement('button');
    button.className = `control-button ${sceneName === state.currentScene ? 'current' : ''}`;
    button.innerHTML = `<span>${escapeHtml(sceneName)}</span><span class="sub">${sceneName === state.currentScene ? 'ON AIR' : 'TAP TO SWITCH'}</span>`;
    button.addEventListener('click', () => send({ action: 'set-scene', sceneName }));
    return button;
  }));
}

function renderAudio() {
  els.audioCount.textContent = String(state.audioInputs.length);
  els.audioGrid.replaceChildren(...state.audioInputs.map((input) => {
    const button = document.createElement('button');
    button.className = `control-button ${input.muted ? 'muted' : 'live-audio'}`;
    button.innerHTML = `<span>${escapeHtml(input.inputName)}</span><span class="sub">${input.muted ? 'MUTED — TAP TO UNMUTE' : 'LIVE — TAP TO MUTE'}</span>`;
    button.addEventListener('click', () => send({ action: 'toggle-mute', inputName: input.inputName }));
    return button;
  }));
}

function renderTransport() {
  els.streamButton.classList.toggle('active', state.streaming);
  els.streamState.textContent = state.streaming ? 'Stop Stream' : 'Start Stream';
  els.recordButton.classList.toggle('active', state.recording);
  els.recordState.textContent = state.recording ? 'Stop Recording' : 'Start Recording';
}

function renderAll() {
  renderScenes();
  renderAudio();
  renderTransport();
}

function applySnapshot(snapshot) {
  state = { ...state, ...snapshot };
  renderAll();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function rememberConnection(pin, targetId) {
  if (els.rememberDevice?.checked) {
    localStorage.setItem(STORAGE.pin, pin);
    localStorage.setItem(STORAGE.target, targetId || '');
    localStorage.setItem(STORAGE.remember, '1');
  } else {
    sessionStorage.setItem(STORAGE.pin, pin);
    sessionStorage.setItem(STORAGE.target, targetId || '');
  }
}

function clearConnectionMemory() {
  Object.values(STORAGE).forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function savedValue(key) {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? '';
}

function scheduleReconnect(pin, targetId) {
  clearTimeout(reconnectTimer);
  reconnectAttempts += 1;
  const delay = Math.min(1000 * reconnectAttempts, 5000);
  reconnectTimer = setTimeout(() => connect({ pin, targetId, reconnecting: true }), delay);
}

function connect({ pin = '', targetId, reconnecting = false } = {}) {
  clearTimeout(reconnectTimer);
  const target = targetId || config.targets[0]?.id;
  if (socket) {
    socket.onclose = null;
    try { socket.close(); } catch {}
  }

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams();
  if (pin) params.set('pin', pin);
  if (target) params.set('target', target);

  socket = new WebSocket(`${scheme}://${location.host}/ws?${params}`);
  setStatus(false, reconnecting ? 'Reconnecting…' : 'Connecting…');

  socket.addEventListener('open', () => {
    reconnectAttempts = 0;
    els.loginCard.classList.add('hidden');
    els.dashboard.classList.remove('hidden');
    rememberConnection(pin, target);
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') applySnapshot(message.data);
    if (message.type === 'obs-status') {
      setStatus(Boolean(message.connected), message.connected ? message.targetName || 'Connected' : 'OBS Offline');
      if (message.targetId) {
        els.targetSelect.value = message.targetId;
        if (localStorage.getItem(STORAGE.remember) === '1') localStorage.setItem(STORAGE.target, message.targetId);
      }
    }
    if (message.type === 'smart-scenes-built') {
      toast(message.message || 'Smart scenes ready');
      send({ action: 'refresh' });
    }
    if (message.type === 'event') {
      if (message.event === 'scene') {
        state.currentScene = message.sceneName;
        renderScenes();
      }
      if (message.event === 'mute') {
        const input = state.audioInputs.find((item) => item.inputName === message.inputName);
        if (input) input.muted = Boolean(message.muted);
        renderAudio();
      }
      if (message.event === 'stream') {
        state.streaming = Boolean(message.active);
        renderTransport();
      }
      if (message.event === 'record') {
        state.recording = Boolean(message.active);
        renderTransport();
      }
    }
    if (message.type === 'error') toast(message.message || 'Something went wrong');
  });

  socket.addEventListener('close', () => {
    setStatus(false);
    const shouldRemember = localStorage.getItem(STORAGE.remember) === '1';
    if (shouldRemember) scheduleReconnect(savedValue(STORAGE.pin), savedValue(STORAGE.target) || target);
  });
  socket.addEventListener('error', () => setStatus(false, 'Connection issue'));
}

async function init() {
  const response = await fetch('/api/config');
  config = await response.json();

  els.targetSelect.replaceChildren(...config.targets.map((target) => {
    const option = document.createElement('option');
    option.value = target.id;
    option.textContent = target.name;
    return option;
  }));

  const storedPin = savedValue(STORAGE.pin);
  const storedTarget = savedValue(STORAGE.target) || config.targets[0]?.id;
  const remembered = localStorage.getItem(STORAGE.remember) === '1';
  if (els.rememberDevice) els.rememberDevice.checked = remembered || !storedPin;

  if (storedTarget) els.targetSelect.value = storedTarget;

  if (config.pinRequired && !storedPin) {
    els.loginCard.classList.remove('hidden');
    els.dashboard.classList.add('hidden');
  } else {
    connect({ pin: storedPin, targetId: storedTarget });
  }
}

els.connectButton.addEventListener('click', () => connect({
  pin: els.pinInput.value.trim(),
  targetId: els.targetSelect.value || config.targets[0]?.id
}));
els.pinInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') els.connectButton.click();
});
els.targetSelect.addEventListener('change', () => {
  const targetId = els.targetSelect.value;
  if (localStorage.getItem(STORAGE.remember) === '1') localStorage.setItem(STORAGE.target, targetId);
  send({ action: 'switch-target', targetId });
});
els.refreshButton.addEventListener('click', () => send({ action: 'refresh' }));
els.forgetButton.addEventListener('click', () => {
  clearConnectionMemory();
  toast('This device will no longer remember the connection');
});
els.streamButton.addEventListener('click', () => {
  const verb = state.streaming ? 'stop' : 'start';
  if (confirm(`Are you sure you want to ${verb} the stream?`)) send({ action: 'toggle-stream' });
});
els.recordButton.addEventListener('click', () => send({ action: 'toggle-record' }));
els.buildScenesButton.addEventListener('click', () => {
  if (confirm('Build the smart starter scene pack in OBS? Existing scenes with the same names will be kept.')) {
    send({ action: 'build-smart-scenes' });
  }
});
document.querySelectorAll('.quick-scene').forEach((button) => {
  button.addEventListener('click', () => {
    const sceneName = button.dataset.scene;
    if (!state.scenes.includes(sceneName)) {
      toast('Build Smart Scenes first');
      return;
    }
    send({ action: 'set-scene', sceneName });
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

init().catch((error) => {
  setStatus(false);
  toast(error.message || 'Could not load configuration');
});
