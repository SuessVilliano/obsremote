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
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
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
  } catch {
    return [];
  }
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
        positionX: x,
        positionY: y,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsWidth: width,
        boundsHeight: height,
        alignment: 5,
        boundsAlignment: 5
      }
    });
  } catch {}
}

async function ensureBrowserBackground(obs, sceneName, inputName, page) {
  if (await sceneHasSource(obs, sceneName, inputName)) return;
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
        width: 1920,
        height: 1080,
        fps: 30,
        reroute_audio: false,
        shutdown: false
      },
      sceneItemEnabled: true
    });
  }
  await fitSource(obs, sceneName, inputName);
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
    await addExistingSource(obs, 'Game + Facecam', game);
    await fitSource(obs, 'Game + Facecam', game);
    await addExistingSource(obs, 'Xbox Fullscreen', game);
    await fitSource(obs, 'Xbox Fullscreen', game);
  }
  if (camera) {
    await addExistingSource(obs, 'Game + Facecam', camera);
    await fitSource(obs, 'Game + Facecam', camera, { x: 1420, y: 780, width: 470, height: 264 });
    await addExistingSource(obs, 'Full Camera', camera);
    await fitSource(obs, 'Full Camera', camera, { x: 260, y: 60, width: 1400, height: 960 });
    await addExistingSource(obs, 'Just Chatting', camera);
    await fitSource(obs, 'Just Chatting', camera, { x: 1040, y: 360, width: 760, height: 680 });
  }

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
  if (sceneItemId != null) {
    try { await obs.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: 0 }); } catch {}
  }
  return { sceneName, inputName };
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
    case 'set-volume':
      await obs.call('SetInputVolume', { inputName: message.inputName, inputVolumeMul: Math.max(0, Math.min(2, Number(message.volume) / 100)) });
      break;
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
      for (const input of snapshot.audioInputs) {
        try { await obs.call('SetInputMute', { inputName: input.inputName, inputMuted: true }); } catch {}
      }
      send(client, { type: 'notice', message: 'All OBS audio muted' });
      break;
    }
    case 'smart-action': {
      const result = await smartAction(obs, message.preset);
      send(client, { type: 'notice', message: `${result.scene} ready${result.mic ? ` • ${result.mic} ${result.muted ? 'muted' : 'live'}` : ''}` });
      break;
    }
    case 'apply-background': {
      const result = await applyBackground(obs, message.page);
      send(client, { type: 'notice', message: `Background added to ${result.sceneName}` });
      send(client, { type: 'snapshot', data: await getSnapshot(obs) });
      break;
    }
    case 'build-smart-scenes': {
      const result = await buildSmartScenes(obs);
      const pieces = ['Smart scene pack ready'];
      pieces.push(result.camera ? `camera: ${result.camera}` : 'camera not auto-detected');
      pieces.push(result.game ? `game: ${result.game}` : 'game source not auto-detected');
      pieces.push(result.mic ? `mic: ${result.mic}` : 'mic not auto-detected');
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
  try { await connectObs(ws, targetId); }
  catch (error) {
    send(ws, { type: 'obs-status', connected: false });
    send(ws, { type: 'error', message: `Could not connect to OBS: ${error.message}` });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nOBS Remote Command Center v2 running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) console.log(`LAN:   http://${addr.address}:${PORT}`);
    }
  }
  if (!REMOTE_PIN) console.warn('\nWARNING: REMOTE_PIN is not set. Set one before exposing this app beyond your private LAN.');
});
