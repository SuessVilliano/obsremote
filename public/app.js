const els = {
  loginCard: document.querySelector('#loginCard'),
  dashboard: document.querySelector('#dashboard'),
  pinInput: document.querySelector('#pinInput'),
  connectButton: document.querySelector('#connectButton'),
  statusPill: document.querySelector('#statusPill'),
  targetSelect: document.querySelector('#targetSelect'),
  refreshButton: document.querySelector('#refreshButton'),
  streamButton: document.querySelector('#streamButton'),
  streamState: document.querySelector('#streamState'),
  recordButton: document.querySelector('#recordButton'),
  recordState: document.querySelector('#recordState'),
  sceneGrid: document.querySelector('#sceneGrid'),
  sceneCount: document.querySelector('#sceneCount'),
  audioGrid: document.querySelector('#audioGrid'),
  audioCount: document.querySelector('#audioCount'),
  toast: document.querySelector('#toast')
};

let config = { pinRequired: false, targets: [] };
let socket = null;
let state = {
  currentScene: '',
  scenes: [],
  audioInputs: [],
  streaming: false,
  recording: false,
  connected: false
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2200);
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

function connect({ pin = '', targetId } = {}) {
  if (socket) socket.close();
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams();
  if (pin) params.set('pin', pin);
  if (targetId) params.set('target', targetId);

  socket = new WebSocket(`${scheme}://${location.host}/ws?${params}`);
  setStatus(false, 'Connecting…');

  socket.addEventListener('open', () => {
    els.loginCard.classList.add('hidden');
    els.dashboard.classList.remove('hidden');
    sessionStorage.setItem('obsremote-pin', pin);
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') applySnapshot(message.data);
    if (message.type === 'obs-status') {
      setStatus(Boolean(message.connected), message.connected ? message.targetName || 'Connected' : 'OBS Offline');
      if (message.targetId) els.targetSelect.value = message.targetId;
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

  socket.addEventListener('close', () => setStatus(false));
  socket.addEventListener('error', () => toast('Could not reach the command center'));
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

  const storedPin = sessionStorage.getItem('obsremote-pin') || '';
  if (config.pinRequired && !storedPin) {
    els.loginCard.classList.remove('hidden');
    els.dashboard.classList.add('hidden');
  } else {
    connect({ pin: storedPin, targetId: config.targets[0]?.id });
  }
}

els.connectButton.addEventListener('click', () => connect({
  pin: els.pinInput.value.trim(),
  targetId: els.targetSelect.value || config.targets[0]?.id
}));
els.pinInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') els.connectButton.click();
});
els.targetSelect.addEventListener('change', () => send({ action: 'switch-target', targetId: els.targetSelect.value }));
els.refreshButton.addEventListener('click', () => send({ action: 'refresh' }));
els.streamButton.addEventListener('click', () => {
  const verb = state.streaming ? 'stop' : 'start';
  if (confirm(`Are you sure you want to ${verb} the stream?`)) send({ action: 'toggle-stream' });
});
els.recordButton.addEventListener('click', () => send({ action: 'toggle-record' }));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

init().catch((error) => {
  setStatus(false);
  toast(error.message || 'Could not load configuration');
});
