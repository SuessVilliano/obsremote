import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';

const PORT = Number(process.env.PORT || 3000);
const REMOTE_PIN = String(process.env.REMOTE_PIN || '');

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
app.use(express.json());
app.use(express.static('public', { extensions: ['html'] }));
app.get('/api/config', (_req, res) => res.json({ pinRequired: Boolean(REMOTE_PIN), targets: targets.map(({ id, name }) => ({ id, name })) }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

async function getSnapshot(obs) {
  const [sceneList, inputs, stream, record] = await Promise.all([
    obs.call('GetSceneList'),
    obs.call('GetInputList'),
    obs.call('GetStreamStatus').catch(() => ({ outputActive: false })),
    obs.call('GetRecordStatus').catch(() => ({ outputActive: false }))
  ]);

  const audioInputs = [];
  for (const input of inputs.inputs || []) {
    try {
      const mute = await obs.call('GetInputMute', { inputName: input.inputName });
      audioInputs.push({ inputName: input.inputName, inputKind: input.inputKind, muted: Boolean(mute.inputMuted) });
    } catch {}
  }

  return {
    scenes: (sceneList.scenes || []).map((s) => s.sceneName),
    currentScene: sceneList.currentProgramSceneName || '',
    audioInputs,
    streaming: Boolean(stream.outputActive),
    recording: Boolean(record.outputActive)
  };
}

function attachObsEvents(client, obs) {
  obs.on('CurrentProgramSceneChanged', ({ sceneName }) => send(client, { type: 'event', event: 'scene', sceneName }));
  obs.on('InputMuteStateChanged', ({ inputName, inputMuted }) => send(client, { type: 'event', event: 'mute', inputName, muted: inputMuted }));
  obs.on('StreamStateChanged', ({ outputActive }) => send(client, { type: 'event', event: 'stream', active: outputActive }));
  obs.on('RecordStateChanged', ({ outputActive }) => send(client, { type: 'event', event: 'record', active: outputActive }));
  obs.on('SceneListChanged', async () => {
    try { send(client, { type: 'snapshot', data: await getSnapshot(obs) }); } catch {}
  });
  obs.on('ConnectionClosed', () => send(client, { type: 'obs-status', connected: false }));
}

async function connectObs(client, targetId) {
  const target = targets.find((t) => t.id === targetId) || targets[0];
  if (client.obs) {
    try { await client.obs.disconnect(); } catch {}
  }
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
  } catch {
    return false;
  }
}

async function addExistingSource(obs, sceneName, sourceName) {
  if (!sourceName) return false;
  if (await sceneHasSource(obs, sceneName, sourceName)) return true;
  try {
    await obs.call('CreateSceneItem', { sceneName, sourceName, sceneItemEnabled: true });
    return true;
  } catch {
    return false;
  }
}

async function ensureBrowserBackground(obs, sceneName, inputName, page) {
  if (await sceneHasSource(obs, sceneName, inputName)) return;
  const inputList = await obs.call('GetInputList');
  const exists = (inputList.inputs || []).some((input) => input.inputName === inputName);
  if (exists) {
    await addExistingSource(obs, sceneName, inputName);
    return;
  }
  await obs.call('CreateInput', {
    sceneName,
    inputName,
    inputKind: 'browser_source',
    inputSettings: {
      url: `http://127.0.0.1:${PORT}/backgrounds/${page}`,
      width: 1920,
      height: 1080,
      fps: 30,
      reroute_audio: false,
      shutdown: false
    },
    sceneItemEnabled: true
  });
}

async function buildSmartScenes(obs) {
  const sceneNames = ['Starting Soon', 'Game + Facecam', 'Full Camera', 'BRB', 'Ending'];
  for (const sceneName of sceneNames) await ensureScene(obs, sceneName);

  await ensureBrowserBackground(obs, 'Starting Soon', 'OBSRemote • Starting Soon', 'starting.html');
  await ensureBrowserBackground(obs, 'BRB', 'OBSRemote • BRB', 'brb.html');
  await ensureBrowserBackground(obs, 'Ending', 'OBSRemote • Ending', 'ending.html');
  await ensureBrowserBackground(obs, 'Full Camera', 'OBSRemote • Studio', 'studio.html');

  const inputList = await obs.call('GetInputList');
  const inputs = inputList.inputs || [];
  const camera = chooseInput(inputs, [/logitech/, /webcam/, /camera/, /cam\b/, /video capture/]);
  const game = chooseInput(inputs, [/xbox/, /capture card/, /game capture/, /hdmi/, /elgato/, /capture/]);

  const added = { camera: false, game: false };
  if (camera) {
    added.camera = await addExistingSource(obs, 'Full Camera', camera);
    await addExistingSource(obs, 'Game + Facecam', camera);
  }
  if (game) added.game = await addExistingSource(obs, 'Game + Facecam', game);

  return { camera, game, added };
}

async function handleCommand(client, message) {
  const obs = client.obs;
  if (!obs) throw new Error('OBS is not connected');

  switch (message.action) {
    case 'set-scene':
      await obs.call('SetCurrentProgramScene', { sceneName: message.sceneName });
      break;
    case 'toggle-mute': {
      const state = await obs.call('GetInputMute', { inputName: message.inputName });
      await obs.call('SetInputMute', { inputName: message.inputName, inputMuted: !state.inputMuted });
      break;
    }
    case 'set-mute':
      await obs.call('SetInputMute', { inputName: message.inputName, inputMuted: Boolean(message.muted) });
      break;
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
    case 'build-smart-scenes': {
      const result = await buildSmartScenes(obs);
      const pieces = ['Smart scenes built'];
      if (result.camera) pieces.push(`camera: ${result.camera}`); else pieces.push('camera not auto-detected');
      if (result.game) pieces.push(`game: ${result.game}`); else pieces.push('game source not auto-detected');
      send(client, { type: 'smart-scenes-built', message: pieces.join(' • '), result });
      send(client, { type: 'snapshot', data: await getSnapshot(obs) });
      break;
    }
    case 'refresh':
      send(client, { type: 'snapshot', data: await getSnapshot(obs) });
      break;
    default:
      throw new Error(`Unknown action: ${message.action}`);
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
    } catch (error) {
      send(ws, { type: 'error', message: error.message || 'Command failed' });
    }
  });
  ws.on('close', async () => {
    if (ws.obs) {
      try { await ws.obs.disconnect(); } catch {}
    }
  });
  try {
    await connectObs(ws, targetId);
  } catch (error) {
    send(ws, { type: 'obs-status', connected: false });
    send(ws, { type: 'error', message: `Could not connect to OBS: ${error.message}` });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nOBS Remote Command Center running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) console.log(`LAN:   http://${addr.address}:${PORT}`);
    }
  }
  if (!REMOTE_PIN) console.warn('\nWARNING: REMOTE_PIN is not set. Set one before exposing this app beyond your private LAN.');
});
