const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const els = {
  loginCard: $('#loginCard'), dashboard: $('#dashboard'), pinInput: $('#pinInput'), rememberDevice: $('#rememberDevice'), connectButton: $('#connectButton'),
  forgetButton: $('#forgetButton'), statusPill: $('#statusPill'), targetSelect: $('#targetSelect'), refreshButton: $('#refreshButton'),
  streamButton: $('#streamButton'), streamState: $('#streamState'), recordButton: $('#recordButton'), recordState: $('#recordState'),
  buildScenesButton: $('#buildScenesButton'), panicButton: $('#panicButton'), sceneGrid: $('#sceneGrid'), sceneCount: $('#sceneCount'),
  sourceGrid: $('#sourceGrid'), sourceCount: $('#sourceCount'), audioGrid: $('#audioGrid'), audioCount: $('#audioCount'), toast: $('#toast'),
  previewImage: $('#previewImage'), previewEmpty: $('#previewEmpty'), previewScene: $('#previewScene'), previewRefresh: $('#previewRefresh'),
  soundName: $('#soundName'), soundFile: $('#soundFile'), uploadSound: $('#uploadSound'), voiceName: $('#voiceName'), recordVoice: $('#recordVoice'),
  recordingState: $('#recordingState'), soundGrid: $('#soundGrid'), soundCount: $('#soundCount'), aiBadge: $('#aiBadge'), aiChat: $('#aiChat'),
  aiForm: $('#aiForm'), aiInput: $('#aiInput'), aiSend: $('#aiSend'), publicUrl: $('#publicUrl'), aiModelLabel: $('#aiModelLabel')
};

let config = { pinRequired: false, targets: [], aiEnabled: false, aiModel: '' };
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let previewTimer = null;
let activeTab = 'control';
let currentPin = '';
let sounds = [];
let mediaRecorder = null;
let mediaStream = null;
let recordingChunks = [];
let aiHistory = [];
let state = { currentScene: '', scenes: [], sceneItems: [], audioInputs: [], streaming: false, recording: false, connected: false };
const STORAGE = { pin: 'obsremote-pin', target: 'obsremote-target', remember: 'obsremote-remember', tab: 'obsremote-tab' };

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}
function setStatus(connected, label = connected ? 'Connected' : 'Offline') {
  state.connected = connected;
  els.statusPill.classList.toggle('online', connected);
  els.statusPill.classList.toggle('offline', !connected);
  els.statusPill.querySelector('strong').textContent = label;
}
function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) { toast('Remote is not connected'); return false; }
  socket.send(JSON.stringify(payload)); return true;
}
function escapeHtml(value) {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function apiHeaders() { return { 'content-type': 'application/json', 'x-remote-pin': currentPin }; }

function showTab(name) {
  activeTab = name;
  localStorage.setItem(STORAGE.tab, name);
  $$('.menu-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  clearInterval(previewTimer);
  if (name === 'preview') {
    requestPreview();
    previewTimer = setInterval(requestPreview, 2200);
  }
  if (name === 'sounds') loadSounds();
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
function renderSources() {
  els.sourceCount.textContent = String(state.sceneItems.length);
  els.sourceGrid.replaceChildren(...state.sceneItems.map((item) => {
    const button = document.createElement('button');
    button.className = `control-button source-toggle ${item.enabled ? 'source-on' : 'source-off'}`;
    button.innerHTML = `<span>${escapeHtml(item.sourceName)}</span><span class="sub">${item.enabled ? 'VISIBLE — TAP TO HIDE' : 'HIDDEN — TAP TO SHOW'}</span>`;
    button.addEventListener('click', () => send({ action: 'toggle-source', sceneName: state.currentScene, sceneItemId: item.sceneItemId }));
    return button;
  }));
}
function renderAudio() {
  els.audioCount.textContent = String(state.audioInputs.length);
  els.audioGrid.replaceChildren(...state.audioInputs.map((input) => {
    const wrap = document.createElement('div');
    wrap.className = `audio-strip ${input.muted ? 'muted' : 'live-audio'}`;
    wrap.innerHTML = `<button class="audio-main"><span>${escapeHtml(input.inputName)}</span><span class="sub">${input.muted ? 'MUTED — TAP TO UNMUTE' : 'LIVE — TAP TO MUTE'}</span></button><div class="volume-row"><span class="volume-label">${Math.round(input.volume ?? 100)}%</span><input class="volume-slider" type="range" min="0" max="200" step="1" value="${Math.max(0,Math.min(200,input.volume ?? 100))}" aria-label="${escapeHtml(input.inputName)} volume"/></div>`;
    const muteButton = wrap.querySelector('.audio-main');
    const slider = wrap.querySelector('.volume-slider');
    const label = wrap.querySelector('.volume-label');
    muteButton.addEventListener('click', () => send({ action: 'toggle-mute', inputName: input.inputName }));
    slider.addEventListener('input', () => { label.textContent = `${slider.value}%`; });
    slider.addEventListener('change', () => send({ action: 'set-volume', inputName: input.inputName, volume: Number(slider.value) }));
    return wrap;
  }));
}
function renderTransport() {
  els.streamButton.classList.toggle('active', state.streaming);
  els.streamState.textContent = state.streaming ? 'Stop Stream' : 'Start Stream';
  els.recordButton.classList.toggle('active', state.recording);
  els.recordState.textContent = state.recording ? 'Stop Recording' : 'Start Recording';
}
function renderAll() { renderScenes(); renderSources(); renderAudio(); renderTransport(); }
function applySnapshot(snapshot) { state = { ...state, ...snapshot }; renderAll(); }

function rememberConnection(pin, targetId) {
  if (els.rememberDevice?.checked) {
    localStorage.setItem(STORAGE.pin, pin); localStorage.setItem(STORAGE.target, targetId || ''); localStorage.setItem(STORAGE.remember, '1');
  } else {
    sessionStorage.setItem(STORAGE.pin, pin); sessionStorage.setItem(STORAGE.target, targetId || '');
  }
}
function clearConnectionMemory() { Object.values(STORAGE).forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); }); }
function savedValue(key) { return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? ''; }
function scheduleReconnect(pin, targetId) {
  clearTimeout(reconnectTimer); reconnectAttempts += 1; const delay = Math.min(1000 * reconnectAttempts, 5000);
  reconnectTimer = setTimeout(() => connect({ pin, targetId, reconnecting: true }), delay);
}
function connect({ pin = '', targetId, reconnecting = false } = {}) {
  currentPin = pin;
  clearTimeout(reconnectTimer); const target = targetId || config.targets[0]?.id;
  if (socket) { socket.onclose = null; try { socket.close(); } catch {} }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'; const params = new URLSearchParams();
  if (pin) params.set('pin', pin); if (target) params.set('target', target);
  socket = new WebSocket(`${scheme}://${location.host}/ws?${params}`); setStatus(false, reconnecting ? 'Reconnecting…' : 'Connecting…');
  socket.addEventListener('open', () => { reconnectAttempts = 0; els.loginCard.classList.add('hidden'); els.dashboard.classList.remove('hidden'); rememberConnection(pin, target); loadSounds(); });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') applySnapshot(message.data);
    if (message.type === 'scene-items') { state.sceneItems = message.data || []; renderSources(); }
    if (message.type === 'preview') {
      els.previewImage.src = message.imageData;
      els.previewImage.classList.add('ready');
      els.previewEmpty.classList.add('hidden');
      els.previewScene.textContent = message.sceneName || state.currentScene || 'Program';
    }
    if (message.type === 'obs-status') {
      setStatus(Boolean(message.connected), message.connected ? message.targetName || 'Connected' : 'OBS Offline');
      if (message.targetId) { els.targetSelect.value = message.targetId; if (localStorage.getItem(STORAGE.remember) === '1') localStorage.setItem(STORAGE.target, message.targetId); }
    }
    if (message.type === 'smart-scenes-built') { toast(message.message || 'Smart scenes ready'); send({ action: 'refresh' }); }
    if (message.type === 'notice' || message.type === 'toast') toast(message.message || 'Done');
    if (message.type === 'event') {
      if (message.event === 'scene') { state.currentScene = message.sceneName; renderScenes(); if (activeTab === 'preview') requestPreview(); }
      if (message.event === 'mute') { const input = state.audioInputs.find((item) => item.inputName === message.inputName); if (input) input.muted = Boolean(message.muted); renderAudio(); }
      if (message.event === 'volume') { const input = state.audioInputs.find((item) => item.inputName === message.inputName); if (input) input.volume = Number(message.volume); renderAudio(); }
      if (message.event === 'source' && message.sceneName === state.currentScene) { const item = state.sceneItems.find((source) => source.sceneItemId === Number(message.sceneItemId)); if (item) item.enabled = Boolean(message.enabled); renderSources(); }
      if (message.event === 'stream') { state.streaming = Boolean(message.active); renderTransport(); }
      if (message.event === 'record') { state.recording = Boolean(message.active); renderTransport(); }
    }
    if (message.type === 'error') toast(message.message || 'Something went wrong');
  });
  socket.addEventListener('close', () => { setStatus(false); const shouldRemember = localStorage.getItem(STORAGE.remember) === '1'; if (shouldRemember) scheduleReconnect(savedValue(STORAGE.pin), savedValue(STORAGE.target) || target); });
  socket.addEventListener('error', () => setStatus(false, 'Connection issue'));
}

function requestPreview() { if (activeTab === 'preview') send({ action: 'get-preview' }); }

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer); let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}
async function uploadBlob(blob, name, filename) {
  if (blob.size > 20 * 1024 * 1024) throw new Error('Keep each sound under 20 MB');
  const data = bufferToBase64(await blob.arrayBuffer());
  const response = await fetch('/api/sounds', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ name, filename, mime: blob.type || 'audio/webm', data }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Upload failed');
  return result.sound;
}
async function loadSounds() {
  if (!currentPin && config.pinRequired) return;
  try {
    const response = await fetch('/api/sounds', { headers: { 'x-remote-pin': currentPin } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load sounds');
    sounds = result.sounds || [];
    renderSounds();
  } catch (error) { if (activeTab === 'sounds') toast(error.message); }
}
function renderSounds() {
  els.soundCount.textContent = String(sounds.length);
  if (!sounds.length) {
    els.soundGrid.innerHTML = '<div class="empty-card">No custom sounds yet. Upload one or record your voice above.</div>';
    return;
  }
  els.soundGrid.replaceChildren(...sounds.map((sound) => {
    const card = document.createElement('div'); card.className = 'sound-pad';
    card.innerHTML = `<button class="sound-fire"><strong>🔊 ${escapeHtml(sound.name)}</strong><span>PLAY IN OBS</span></button><div class="sound-actions"><button class="mini-button audition">Preview</button><button class="mini-button delete">Delete</button></div>`;
    card.querySelector('.sound-fire').addEventListener('click', () => send({ action: 'play-custom-sound', soundId: sound.id }));
    card.querySelector('.audition').addEventListener('click', () => { const audio = new Audio(`/uploads/sounds/${encodeURIComponent(sound.filename)}`); audio.play().catch(() => toast('Audio preview was blocked by this browser')); });
    card.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Delete “${sound.name}”?`)) return;
      const response = await fetch(`/api/sounds/${encodeURIComponent(sound.id)}`, { method: 'DELETE', headers: { 'x-remote-pin': currentPin } });
      const result = await response.json(); if (!response.ok) return toast(result.error || 'Delete failed'); loadSounds();
    });
    return card;
  }));
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toast('Voice recording is not supported in this browser. Upload an audio file instead.');
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordingChunks = [];
  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordingChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    try {
      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const name = els.voiceName.value.trim() || `Voice clip ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      els.recordingState.textContent = 'Saving…';
      await uploadBlob(blob, name, `${name}.webm`);
      els.recordingState.textContent = 'Saved'; els.voiceName.value = ''; await loadSounds();
    } catch (error) { toast(error.message); els.recordingState.textContent = 'Save failed'; }
    mediaStream?.getTracks().forEach((t) => t.stop()); mediaStream = null; mediaRecorder = null; els.recordVoice.textContent = '🎙 Start recording';
  };
  mediaRecorder.start(); els.recordingState.textContent = 'Recording… tap again to stop'; els.recordVoice.textContent = '⏹ Stop & save';
}

function appendAi(role, text, details = '') {
  const div = document.createElement('div'); div.className = `ai-message ${role}`;
  div.innerHTML = `<div>${escapeHtml(text)}</div>${details ? `<small>${escapeHtml(details)}</small>` : ''}`;
  els.aiChat.append(div); els.aiChat.scrollTop = els.aiChat.scrollHeight;
}
async function askAi(message) {
  if (!config.aiEnabled) return appendAi('assistant', 'AI is not configured yet. Add OPENAI_API_KEY to .env on the Mac and restart OBS Remote.');
  appendAi('user', message); aiHistory.push({ role: 'user', text: message }); els.aiSend.disabled = true; els.aiSend.textContent = 'Working…';
  try {
    const response = await fetch('/api/ai', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ message, targetId: els.targetSelect.value, history: aiHistory.slice(-8) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'AI request failed');
    const done = (result.actionResults || []).filter((x) => x.ok).map((x) => x.result).join(' • ');
    const failed = (result.actionResults || []).filter((x) => !x.ok).map((x) => x.error).join(' • ');
    appendAi('assistant', result.reply || 'Done.', [done, failed].filter(Boolean).join(' | '));
    aiHistory.push({ role: 'assistant', text: result.reply || 'Done.' });
    if (result.snapshot) applySnapshot(result.snapshot);
  } catch (error) { appendAi('assistant', `I couldn't complete that: ${error.message}`); }
  finally { els.aiSend.disabled = false; els.aiSend.textContent = 'Send'; }
}

async function init() {
  const response = await fetch('/api/config'); config = await response.json();
  els.targetSelect.replaceChildren(...config.targets.map((target) => { const option = document.createElement('option'); option.value = target.id; option.textContent = target.name; return option; }));
  els.aiBadge.textContent = config.aiEnabled ? 'READY' : 'NEEDS API KEY';
  els.aiBadge.classList.toggle('warn-badge', !config.aiEnabled);
  els.aiModelLabel.textContent = config.aiEnabled ? config.aiModel : 'Not configured';
  els.publicUrl.textContent = location.origin;
  const storedPin = savedValue(STORAGE.pin); const storedTarget = savedValue(STORAGE.target) || config.targets[0]?.id; const remembered = localStorage.getItem(STORAGE.remember) === '1';
  if (els.rememberDevice) els.rememberDevice.checked = remembered || !storedPin; if (storedTarget) els.targetSelect.value = storedTarget;
  const savedTab = localStorage.getItem(STORAGE.tab); if ($(`.menu-tab[data-tab="${savedTab}"]`)) showTab(savedTab);
  if (config.pinRequired && !storedPin) { els.loginCard.classList.remove('hidden'); els.dashboard.classList.add('hidden'); } else connect({ pin: storedPin, targetId: storedTarget });
}

$$('.menu-tab').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
els.connectButton.addEventListener('click', () => connect({ pin: els.pinInput.value.trim(), targetId: els.targetSelect.value || config.targets[0]?.id }));
els.pinInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') els.connectButton.click(); });
els.targetSelect.addEventListener('change', () => { const targetId = els.targetSelect.value; if (localStorage.getItem(STORAGE.remember) === '1') localStorage.setItem(STORAGE.target, targetId); send({ action: 'switch-target', targetId }); });
els.refreshButton.addEventListener('click', () => send({ action: 'refresh' }));
els.forgetButton.addEventListener('click', () => { clearConnectionMemory(); toast('Saved connection cleared on this device'); });
els.streamButton.addEventListener('click', () => { const verb = state.streaming ? 'stop' : 'start'; if (confirm(`Are you sure you want to ${verb} the stream?`)) send({ action: 'toggle-stream' }); });
els.recordButton.addEventListener('click', () => send({ action: 'toggle-record' }));
els.buildScenesButton.addEventListener('click', () => { if (confirm('Build or repair the full smart scene pack in OBS? Existing scenes are kept.')) send({ action: 'build-smart-scenes' }); });
els.panicButton.addEventListener('click', () => { if (confirm('Mute EVERY OBS audio source right now?')) send({ action: 'panic-mute' }); });
$$('.smart-action').forEach((button) => button.addEventListener('click', () => send({ action: 'smart-action', preset: button.dataset.preset })));
$$('.background-card').forEach((button) => button.addEventListener('click', () => send({ action: 'apply-background', page: button.dataset.page })));
els.previewRefresh.addEventListener('click', requestPreview);
els.uploadSound.addEventListener('click', async () => {
  const file = els.soundFile.files?.[0]; if (!file) return toast('Choose an audio file first');
  els.uploadSound.disabled = true; els.uploadSound.textContent = 'Uploading…';
  try { await uploadBlob(file, els.soundName.value.trim() || file.name.replace(/\.[^.]+$/, ''), file.name); els.soundFile.value = ''; els.soundName.value = ''; await loadSounds(); toast('Sound added'); }
  catch (error) { toast(error.message); } finally { els.uploadSound.disabled = false; els.uploadSound.textContent = 'Add sound'; }
});
els.recordVoice.addEventListener('click', async () => {
  try { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); else await startVoiceRecording(); }
  catch (error) { toast(error.message); mediaStream?.getTracks().forEach((t) => t.stop()); mediaStream = null; mediaRecorder = null; }
});
els.aiForm.addEventListener('submit', (event) => { event.preventDefault(); const message = els.aiInput.value.trim(); if (!message) return; els.aiInput.value = ''; askAi(message); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
init().catch((error) => { setStatus(false); toast(error.message || 'Could not load configuration'); });
