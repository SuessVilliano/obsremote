import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';

const PORT = Number(process.env.PORT || 3000);
const REMOTE_PIN = String(process.env.REMOTE_PIN || '');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '');
const AI_MODEL = String(process.env.AI_MODEL || 'gpt-5-mini');
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const SOUND_DIR = path.join(ROOT, 'public', 'uploads', 'sounds');
const SOUND_DB = path.join(DATA_DIR, 'sounds.json');
const SOUND_TOKEN = crypto.randomBytes(24).toString('hex');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SOUND_DIR, { recursive: true });
if (!fs.existsSync(SOUND_DB)) fs.writeFileSync(SOUND_DB, '[]\n');

function parseTargets() {
  if (process.env.OBS_TARGETS_JSON) {
    try {
      const parsed = JSON.parse(process.env.OBS_TARGETS_JSON);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('OBS_TARGETS_JSON must be a non-empty array');
      return parsed.map((t, index) => ({
        id: String(t.id || `obs-${index + 1}`),
        name: String(t.name || `OBS ${index + 1}`),
        url: String(t.url || 'ws://127.0.0.1:4455'),
        password: String(t.password || '')
      }));
    } catch (error) {
      console.error('Invalid OBS_TARGETS_JSON:', error.message);
      process.exit(1);
    }
  }
  return [{
    id: 'main',
    name: process.env.OBS_NAME || 'Mac mini OBS',
    url: process.env.OBS_WS_URL || 'ws://127.0.0.1:4455',
    password: process.env.OBS_WS_PASSWORD || ''
  }];
}

const targets = parseTargets();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '28mb' }));
app.use(express.static('public', { extensions: ['html'] }));

function requirePin(req, res, next) {
  if (!REMOTE_PIN) return next();
  const pin = String(req.headers['x-remote-pin'] || req.query.pin || '');
  if (pin !== REMOTE_PIN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function loadSounds() {
  try {
    const data = JSON.parse(fs.readFileSync(SOUND_DB, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveSounds(sounds) {
  fs.writeFileSync(SOUND_DB, JSON.stringify(sounds, null, 2) + '\n');
}

function safeLabel(value, fallback = 'Sound') {
  const clean = String(value || '').replace(/[<>]/g, '').trim().slice(0, 60);
  return clean || fallback;
}

function extensionFor(mime, filename = '') {
  const byMime = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a'
  };
  const ext = path.extname(filename).toLowerCase();
  if (['.mp3', '.wav', '.webm', '.ogg', '.m4a', '.mp4'].includes(ext)) return ext;
  return byMime[mime] || '.webm';
}

app.get('/api/config', (_req, res) => res.json({
  pinRequired: Boolean(REMOTE_PIN),
  aiEnabled: Boolean(OPENAI_API_KEY),
  aiModel: OPENAI_API_KEY ? AI_MODEL : '',
  targets: targets.map(({ id, name }) => ({ id, name }))
}));
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '3.0.0' }));

app.get('/api/sounds', requirePin, (_req, res) => {
  res.json({ sounds: loadSounds() });
});

app.post('/api/sounds', requirePin, (req, res) => {
  const { name, mime, data, filename } = req.body || {};
  if (!String(mime || '').startsWith('audio/')) return res.status(400).json({ error: 'Audio files only' });
  if (!data || typeof data !== 'string') return res.status(400).json({ error: 'Missing audio data' });
  let buffer;
  try { buffer = Buffer.from(data, 'base64'); } catch { return res.status(400).json({ error: 'Invalid audio data' }); }
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'Audio must be between 1 byte and 20 MB' });

  const id = crypto.randomUUID();
  const ext = extensionFor(String(mime), String(filename || ''));
  const storedName = `${id}${ext}`;
  fs.writeFileSync(path.join(SOUND_DIR, storedName), buffer);
  const item = {
    id,
    name: safeLabel(name, path.basename(filename || 'Sound', path.extname(filename || ''))),
    filename: storedName,
    mime: String(mime),
    bytes: buffer.length,
    createdAt: new Date().toISOString()
  };
  const sounds = loadSounds();
  sounds.push(item);
  saveSounds(sounds);
  res.status(201).json({ sound: item });
});

app.delete('/api/sounds/:id', requirePin, (req, res) => {
  const sounds = loadSounds();
  const index = sounds.findIndex((s) => s.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Sound not found' });
  const [removed] = sounds.splice(index, 1);
  const file = path.join(SOUND_DIR, removed.filename);
  try { fs.unlinkSync(file); } catch {}
  saveSounds(sounds);
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const playerWss = new WebSocketServer({ server, path: '/sound-player' });
const soundPlayers = new Set();

playerWss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.searchParams.get('token') !== SOUND_TOKEN) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  soundPlayers.add(ws);
  ws.on('close', () => soundPlayers.delete(ws));
});

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcastSound(sound) {
  const payload = JSON.stringify({ type: 'play', sound });
  for (const ws of soundPlayers) if (ws.readyState === 1) ws.send(payload);
}

async function getCurrentSceneItems(obs, sceneName) {
  if (!sceneName) return [];
  try {
    const result = await obs.call('GetSceneItemList', { sceneName });
    return (result.sceneItems || []).map((item) => ({
      sceneItemId: item.sceneItemId,
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      enabled: Boolean(item.sceneItemEnabled)
    }));
  } catch { return []; }
}

async function getSnapshot(obs) {
  const [sceneList, inputs, stream, record, transition] = await Promise.all([
    obs.call('GetSceneList'),
    obs.call('GetInputList'),
    obs.call('GetStreamStatus').catch(() => ({ outputActive: false })),
    obs.call('GetRecordStatus').catch(() => ({ outputActive: false })),
    obs.call('GetCurrentSceneTransition').catch(() => ({ transitionName: '' }))
  ]);
  const audioInputs = [];
  for (const input of inputs.inputs || []) {
    try {
      const [mute, volume] = await Promise.all([
        obs.call('GetInputMute', { inputName: input.inputName }),
        obs.call('GetInputVolume', { inputName: input.inputName })
      ]);
      audioInputs.push({
        inputName: input.inputName,
        inputKind: input.inputKind,
        muted: Boolean(mute.inputMuted),
        volume: Math.round((Number(volume.inputVolumeMul) || 0) * 100)
      });
    } catch {}
  }
  const currentScene = sceneList.currentProgramSceneName || '';
  return {
    scenes: (sceneList.scenes || []).map((s) => s.sceneName),
    currentScene,
    sceneItems: await getCurrentSceneItems(obs, currentScene),
    audioInputs,
    streaming: Boolean(stream.outputActive),
    recording: Boolean(record.outputActive),
    transitionName: transition.transitionName || ''
  };
}

function attachObsEvents(client, obs) {
  obs.on('CurrentProgramSceneChanged', async ({ sceneName }) => {
    send(client, { type: 'event', event: 'scene', sceneName });
    send(client, { type: 'scene-items', data: await getCurrentSceneItems(obs, sceneName) });
  });
  obs.on('InputMuteStateChanged', ({ inputName, inputMuted }) => send(client, { type: 'event', event: 'mute', inputName, muted: inputMuted }));
  obs.on('InputVolumeChanged', ({ inputName, inputVolumeMul }) => send(client, { type: 'event', event: 'volume', inputName, volume: Math.round((Number(inputVolumeMul) || 0) * 100) }));
  obs.on('SceneItemEnableStateChanged', ({ sceneName, sceneItemId, sceneItemEnabled }) => send(client, { type: 'event', event: 'source', sceneName, sceneItemId, enabled: sceneItemEnabled }));
  obs.on('StreamStateChanged', ({ outputActive }) => send(client, { type: 'event', event: 'stream', active: outputActive }));
  obs.on('RecordStateChanged', ({ outputActive }) => send(client, { type: 'event', event: 'record', active: outputActive }));
  obs.on('SceneListChanged', async () => {
    try { send(client, { type: 'snapshot', data: await getSnapshot(obs) }); } catch {}
  });
  obs.on('ConnectionClosed', () => send(client, { type: 'obs-status', connected: false }));
}

async function connectTarget(targetId) {
  const target = targets.find((t) => t.id === targetId) || targets[0];
  const obs = new OBSWebSocket();
  await obs.connect(target.url, target.password, { eventSubscriptions: EventSubscription.All });
  return { obs, target };
}

async function connectObs(client, targetId) {
  const target = targets.find((t) => t.id === targetId) || targets[0];
  if (client.obs) { try { await client.obs.disconnect(); } catch {} }
  const obs = new OBSWebSocket();
  client.obs = obs;
  client.targetId = target.id;
  attachObsEvents(client, obs);
  await obs.connect(target.url, target.password, { eventSubscriptions: EventSubscription.All });
  send(client, { type: 'obs-status', connected: true, targetId: target.id, targetName: target.name });
  send(client, { type: 'snapshot', data: await getSnapshot(obs) });
}

function chooseInput(inputs, patterns) {
  const normalized = (inputs || []).map((input) => ({ ...input, n: input.inputName.toLowerCase() }));
  for (const pattern of patterns) {
    const match = normalized.find((input) => pattern.test(input.n));
    if (match) return match.inputName;
  }
  return '';
}

async function ensureScene(obs, sceneName) {
  const list = await obs.call('GetSceneList');
  if (!(list.scenes || []).some((s) => s.sceneName === sceneName)) await obs.call('CreateScene', { sceneName });
}

async function sceneHasSource(obs, sceneName, sourceName) {
  try {
    const items = await obs.call('GetSceneItemList', { sceneName });
    return (items.sceneItems || []).some((item) => item.sourceName === sourceName);
  } catch { return false; }
}

async function addExistingSource(obs, sceneName, sourceName) {
  if (!sourceName) return false;
  if (await sceneHasSource(obs, sceneName, sourceName)) return true;
  try {
    await obs.call('CreateSceneItem', { sceneName, sourceName, sceneItemEnabled: true });
    return true;
  } catch { return false; }
}

async function getSceneItemId(obs, sceneName, sourceName) {
  const items = await obs.call('GetSceneItemList', { sceneName });
  const item = (items.sceneItems || []).find((i) => i.sourceName === sourceName);
  return item?.sceneItemId;
}

async function fitSource(obs, sceneName, sourceName, { x = 0, y = 0, width = 1920, height = 1080 } = {}) {
  try {
    const sceneItemId = await getSceneItemId(obs, sceneName, sourceName);
    if (sceneItemId == null) return;
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX: x, positionY: y,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsWidth: width, boundsHeight: height,
        alignment: 5, boundsAlignment: 5
      }
    });
  } catch {}
}

async function ensureBrowserBackground(obs, sceneName, inputName, page) {
  if (!(await sceneHasSource(obs, sceneName, inputName))) {
    const inputList = await obs.call('GetInputList');
    const exists = (inputList.inputs || []).some((input) => input.inputName === inputName);
    if (exists) await addExistingSource(obs, sceneName, inputName);
    else {
      await obs.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings: {
          url: `http://127.0.0.1:${PORT}/backgrounds/${page}`,
          width: 1920, height: 1080, fps: 30,
          reroute_audio: false, shutdown: false
        },
        sceneItemEnabled: true
      });
    }
  }
  await fitSource(obs, sceneName, inputName);
}

async function ensureSoundboardSource(obs, sceneName) {
  const inputName = 'OBSRemote • Custom Soundboard';
  if (!(await sceneHasSource(obs, sceneName, inputName))) {
    const inputList = await obs.call('GetInputList');
    const exists = (inputList.inputs || []).some((input) => input.inputName === inputName);
    if (exists) await addExistingSource(obs, sceneName, inputName);
    else {
      await obs.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings: {
          url: `http://127.0.0.1:${PORT}/soundboard-player.html?token=${SOUND_TOKEN}`,
          width: 64, height: 64, fps: 30,
          reroute_audio: true, shutdown: false
        },
        sceneItemEnabled: true
      });
    }
  }
  return inputName;
}

async function playCustomSound(obs, soundId) {
  const sound = loadSounds().find((s) => s.id === soundId);
  if (!sound) throw new Error('Sound not found');
  const sceneList = await obs.call('GetSceneList');
  const sceneName = sceneList.currentProgramSceneName;
  if (!sceneName) throw new Error('No active scene');
  await ensureSoundboardSource(obs, sceneName);
  await new Promise((resolve) => setTimeout(resolve, 250));
  broadcastSound({ id: sound.id, name: sound.name, url: `/uploads/sounds/${sound.filename}` });
  return sound;
}

async function buildSmartScenes(obs) {
  const sceneNames = ['Starting Soon', 'Game + Facecam', 'Xbox Fullscreen', 'Full Camera', 'Just Chatting', 'BRB', 'Ending'];
  for (const sceneName of sceneNames) await ensureScene(obs, sceneName);
  await ensureBrowserBackground(obs, 'Starting Soon', 'OBSRemote • Starting Soon', 'starting.html');
  await ensureBrowserBackground(obs, 'BRB', 'OBSRemote • BRB', 'brb.html');
  await ensureBrowserBackground(obs, 'Ending', 'OBSRemote • Ending', 'ending.html');
  await ensureBrowserBackground(obs, 'Full Camera', 'OBSRemote • Studio', 'studio.html');
  await ensureBrowserBackground(obs, 'Just Chatting', 'OBSRemote • Studio Chat', 'studio.html');

  const inputList = await obs.call('GetInputList');
  const inputs = inputList.inputs || [];
  const camera = chooseInput(inputs, [/logitech/, /webcam/, /camera/, /cam\b/, /video capture/]);
  const game = chooseInput(inputs, [/xbox/, /capture card/, /game capture/, /hdmi/, /elgato/, /capture/]);
  const mic = chooseInput(inputs, [/mini mic/, /microphone/, /mic\b/, /audio input/]);

  if (game) {
    await addExistingSource(obs, 'Game + Facecam', game); await fitSource(obs, 'Game + Facecam', game);
    await addExistingSource(obs, 'Xbox Fullscreen', game); await fitSource(obs, 'Xbox Fullscreen', game);
  }
  if (camera) {
    await addExistingSource(obs, 'Game + Facecam', camera); await fitSource(obs, 'Game + Facecam', camera, { x: 1420, y: 780, width: 470, height: 264 });
    await addExistingSource(obs, 'Full Camera', camera); await fitSource(obs, 'Full Camera', camera, { x: 260, y: 60, width: 1400, height: 960 });
    await addExistingSource(obs, 'Just Chatting', camera); await fitSource(obs, 'Just Chatting', camera, { x: 1040, y: 360, width: 760, height: 680 });
  }
  for (const sceneName of sceneNames) await ensureSoundboardSource(obs, sceneName);
  return { camera, game, mic, scenes: sceneNames };
}

async function findMic(obs) {
  const inputList = await obs.call('GetInputList');
  return chooseInput(inputList.inputs || [], [/mini mic/, /microphone/, /mic\b/, /audio input/]);
}

async function setMicMute(obs, muted) {
  const mic = await findMic(obs);
  if (mic) await obs.call('SetInputMute', { inputName: mic, inputMuted: Boolean(muted) });
  return mic;
}

async function smartAction(obs, action) {
  const map = {
    starting: { scene: 'Starting Soon', mute: true },
    game: { scene: 'Game + Facecam', mute: false },
    xbox: { scene: 'Xbox Fullscreen', mute: false },
    camera: { scene: 'Full Camera', mute: false },
    chat: { scene: 'Just Chatting', mute: false },
    brb: { scene: 'BRB', mute: true },
    ending: { scene: 'Ending', mute: true }
  };
  const preset = map[action];
  if (!preset) throw new Error('Unknown smart action');
  const scenes = await obs.call('GetSceneList');
  if (!(scenes.scenes || []).some((s) => s.sceneName === preset.scene)) throw new Error('Build Smart Scenes first');
  await obs.call('SetCurrentProgramScene', { sceneName: preset.scene });
  const mic = await setMicMute(obs, preset.mute);
  return { scene: preset.scene, mic, muted: preset.mute };
}

async function applyBackground(obs, page) {
  const allowed = new Set(['starting.html', 'brb.html', 'ending.html', 'studio.html', 'neon.html', 'minimal.html']);
  if (!allowed.has(page)) throw new Error('Unknown background');
  const sceneList = await obs.call('GetSceneList');
  const sceneName = sceneList.currentProgramSceneName;
  if (!sceneName) throw new Error('No active scene');
  const inputName = `OBSRemote • Background • ${page.replace('.html', '')}`;
  await ensureBrowserBackground(obs, sceneName, inputName, page);
  const sceneItemId = await getSceneItemId(obs, sceneName, inputName);
  if (sceneItemId != null) { try { await obs.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: 0 }); } catch {} }
  return { sceneName, inputName };
}

async function getPreview(obs) {
  const list = await obs.call('GetSceneList');
  const sceneName = list.currentProgramSceneName;
  if (!sceneName) throw new Error('No active scene');
  const shot = await obs.call('GetSourceScreenshot', {
    sourceName: sceneName,
    imageFormat: 'jpg',
    imageWidth: 960,
    imageCompressionQuality: 72
  });
  return { sceneName, imageData: shot.imageData };
}

function explicitControlAllowed(message, verb) {
  const m = String(message || '').toLowerCase();
  return m.includes(verb) || m.includes(`${verb} the`);
}

async function executeAiAction(obs, action, userMessage) {
  switch (action.type) {
    case 'set_scene':
      await obs.call('SetCurrentProgramScene', { sceneName: String(action.scene) });
      return `Switched to ${action.scene}`;
    case 'smart_mode': {
      const r = await smartAction(obs, String(action.mode));
      return `Smart mode: ${r.scene}`;
    }
    case 'mute':
      await obs.call('SetInputMute', { inputName: String(action.input), inputMuted: Boolean(action.muted) });
      return `${action.input} ${action.muted ? 'muted' : 'unmuted'}`;
    case 'volume':
      await obs.call('SetInputVolume', { inputName: String(action.input), inputVolumeMul: Math.max(0, Math.min(2, Number(action.volume) / 100)) });
      return `${action.input} volume set to ${action.volume}%`;
    case 'build_scenes':
      await buildSmartScenes(obs);
      return 'Smart scenes built/repaired';
    case 'background':
      await applyBackground(obs, String(action.page));
      return `Background applied: ${action.page}`;
    case 'play_sound': {
      const sound = await playCustomSound(obs, String(action.soundId));
      return `Played ${sound.name}`;
    }
    case 'toggle_source': {
      const sceneList = await obs.call('GetSceneList');
      const sceneName = sceneList.currentProgramSceneName;
      const item = (await getCurrentSceneItems(obs, sceneName)).find((i) => i.sourceName === action.source);
      if (!item) throw new Error(`Source not found: ${action.source}`);
      await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: action.enabled !== false });
      return `${action.source} ${action.enabled === false ? 'hidden' : 'shown'}`;
    }
    case 'record': {
      const wantsStart = action.state === 'start';
      if (!explicitControlAllowed(userMessage, wantsStart ? 'record' : 'stop record')) throw new Error('Recording action requires an explicit user request');
      const status = await obs.call('GetRecordStatus');
      if (wantsStart && !status.outputActive) await obs.call('StartRecord');
      if (!wantsStart && status.outputActive) await obs.call('StopRecord');
      return wantsStart ? 'Recording started' : 'Recording stopped';
    }
    case 'stream': {
      const wantsStart = action.state === 'start';
      if (!explicitControlAllowed(userMessage, wantsStart ? 'start stream' : 'stop stream')) throw new Error('Streaming action requires an explicit user request');
      const status = await obs.call('GetStreamStatus');
      if (wantsStart && !status.outputActive) await obs.call('StartStream');
      if (!wantsStart && status.outputActive) await obs.call('StopStream');
      return wantsStart ? 'Stream started' : 'Stream stopped';
    }
    default:
      throw new Error(`Unsupported AI action: ${action.type}`);
  }
}

app.post('/api/ai', requirePin, async (req, res) => {
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'AI assistant is not configured. Add OPENAI_API_KEY to .env and restart.' });
  const message = safeLabel(req.body?.message, '').slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'Message required' });
  const targetId = String(req.body?.targetId || targets[0].id);
  let obs;
  try {
    const connected = await connectTarget(targetId);
    obs = connected.obs;
    const snapshot = await getSnapshot(obs);
    const sounds = loadSounds().map(({ id, name }) => ({ id, name }));
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

    const instructions = `You are OBS Remote AI, an operations assistant embedded in a private OBS control panel. Return ONLY a JSON object with keys reply and actions. reply is concise natural language. actions is an array of zero or more allowed actions. Never invent scene, input, source, or sound names. Use the live OBS context supplied by the user. Allowed action shapes: {"type":"set_scene","scene":"exact scene"}, {"type":"smart_mode","mode":"starting|game|xbox|camera|chat|brb|ending"}, {"type":"mute","input":"exact input","muted":true}, {"type":"volume","input":"exact input","volume":0-200}, {"type":"build_scenes"}, {"type":"background","page":"studio.html|neon.html|minimal.html|starting.html|brb.html|ending.html"}, {"type":"play_sound","soundId":"exact id"}, {"type":"toggle_source","source":"exact source","enabled":true}, {"type":"record","state":"start|stop"}, {"type":"stream","state":"start|stop"}. Only request stream/record actions when the user's message explicitly asks for that exact operation. If a request cannot be done with these actions, explain what is missing and return no action for that part.`;

    const input = `Respond in JSON.\nLive OBS context: ${JSON.stringify({ snapshot, sounds })}\nRecent chat: ${JSON.stringify(history)}\nUser request: ${message}`;
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        instructions,
        input,
        text: { format: { type: 'json_object' } },
        max_output_tokens: 900
      })
    });
    const result = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(result?.error?.message || 'AI request failed');
    let plan;
    try { plan = JSON.parse(result.output_text || '{}'); } catch { throw new Error('AI returned invalid JSON'); }
    const actions = Array.isArray(plan.actions) ? plan.actions.slice(0, 8) : [];
    const actionResults = [];
    for (const action of actions) {
      try { actionResults.push({ ok: true, action, result: await executeAiAction(obs, action, message) }); }
      catch (error) { actionResults.push({ ok: false, action, error: error.message }); }
    }
    res.json({ reply: String(plan.reply || 'Done.'), actionResults, snapshot: await getSnapshot(obs) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'AI assistant failed' });
  } finally {
    if (obs) { try { await obs.disconnect(); } catch {} }
  }
});

async function handleCommand(client, message) {
  const obs = client.obs;
  if (!obs) throw new Error('OBS is not connected');
  switch (message.action) {
    case 'set-scene': await obs.call('SetCurrentProgramScene', { sceneName: message.sceneName }); break;
    case 'toggle-mute': {
      const state = await obs.call('GetInputMute', { inputName: message.inputName });
      await obs.call('SetInputMute', { inputName: message.inputName, inputMuted: !state.inputMuted });
      break;
    }
    case 'set-mute': await obs.call('SetInputMute', { inputName: message.inputName, inputMuted: Boolean(message.muted) }); break;
    case 'set-volume': await obs.call('SetInputVolume', { inputName: message.inputName, inputVolumeMul: Math.max(0, Math.min(2, Number(message.volume) / 100)) }); break;
    case 'toggle-source': {
      const sceneList = await obs.call('GetSceneList');
      const sceneName = message.sceneName || sceneList.currentProgramSceneName;
      const item = (await getCurrentSceneItems(obs, sceneName)).find((i) => i.sceneItemId === Number(message.sceneItemId));
      if (!item) throw new Error('Source not found in current scene');
      await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: !item.enabled });
      break;
    }
    case 'toggle-stream': {
      const status = await obs.call('GetStreamStatus');
      if (status.outputActive) await obs.call('StopStream'); else await obs.call('StartStream');
      break;
    }
    case 'toggle-record': {
      const status = await obs.call('GetRecordStatus');
      if (status.outputActive) await obs.call('StopRecord'); else await obs.call('StartRecord');
      break;
    }
    case 'panic-mute': {
      const snapshot = await getSnapshot(obs);
      for (const input of snapshot.audioInputs) { try { await obs.call('SetInputMute', { inputName: input.inputName, inputMuted: true }); } catch {} }
      break;
    }
    case 'build-smart-scenes': {
      const result = await buildSmartScenes(obs);
      send(client, { type: 'smart-scenes-built', message: `Smart scenes ready${result.camera ? ` • camera: ${result.camera}` : ''}${result.game ? ` • game: ${result.game}` : ''}`, result });
      send(client, { type: 'snapshot', data: await getSnapshot(obs) });
      break;
    }
    case 'smart-action': {
      const result = await smartAction(obs, message.preset);
      send(client, { type: 'toast', message: `${result.scene}${result.mic ? ` • ${result.mic} ${result.muted ? 'muted' : 'live'}` : ''}` });
      break;
    }
    case 'apply-background': {
      const result = await applyBackground(obs, message.page);
      send(client, { type: 'toast', message: `Background added to ${result.sceneName}` });
      send(client, { type: 'scene-items', data: await getCurrentSceneItems(obs, result.sceneName) });
      break;
    }
    case 'play-custom-sound': {
      const sound = await playCustomSound(obs, message.soundId);
      send(client, { type: 'toast', message: `Played ${sound.name}` });
      break;
    }
    case 'get-preview': {
      const preview = await getPreview(obs);
      send(client, { type: 'preview', ...preview, at: Date.now() });
      break;
    }
    case 'refresh': send(client, { type: 'snapshot', data: await getSnapshot(obs) }); break;
    default: throw new Error(`Unknown action: ${message.action}`);
  }
}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pin = url.searchParams.get('pin') || '';
  const targetId = url.searchParams.get('target') || targets[0].id;
  if (REMOTE_PIN && pin !== REMOTE_PIN) {
    send(ws, { type: 'error', message: 'Incorrect remote PIN' });
    ws.close(1008, 'Unauthorized');
    return;
  }
  ws.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.action === 'switch-target') await connectObs(ws, message.targetId);
      else await handleCommand(ws, message);
    } catch (error) { send(ws, { type: 'error', message: error.message || 'Command failed' }); }
  });
  ws.on('close', async () => { if (ws.obs) { try { await ws.obs.disconnect(); } catch {} } });
  try { await connectObs(ws, targetId); }
  catch (error) {
    send(ws, { type: 'obs-status', connected: false });
    send(ws, { type: 'error', message: `Could not connect to OBS: ${error.message}` });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nOBS Remote Command Center v3 running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) if (addr.family === 'IPv4' && !addr.internal) console.log(`LAN:   http://${addr.address}:${PORT}`);
  }
  if (!REMOTE_PIN) console.warn('\nWARNING: REMOTE_PIN is not set. Set one before exposing this app beyond your private LAN.');
  if (!OPENAI_API_KEY) console.warn('AI assistant disabled: add OPENAI_API_KEY to .env to enable it.');
});
