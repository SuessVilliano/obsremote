import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/v5-ui.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/v5-ui.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');

test('every static literal #id queried by app.js exists in index.html',()=>{const dynamic=new Set(['destForm','playlistForm']);const ids=[...app.matchAll(/\$\(['"]#([A-Za-z0-9_-]+)['"]\)/g)].map(m=>m[1]);const missing=[...new Set(ids)].filter(id=>!dynamic.has(id)&&!new RegExp(`id=["']${id}["']`).test(html));assert.deepEqual(missing,[])});
test('dynamic modal forms are actually created before query',()=>{assert.match(app,/id="destForm"/);assert.match(app,/id="playlistForm"/)});
test('navigation tabs have matching views',()=>{const tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);const views=[...html.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual([...new Set(tabs)].sort(),[...new Set(views)].sort())});
test('HTML and service worker reference the same release assets',()=>{for(const pattern of [/styles\.css\?v=50/,/app\.js\?v=50/,/v5-ui\.css\?v=51/,/v5-ui\.js\?v=51/,/audio-editor\.css\?v=52/,/audio-editor\.js\?v=52/]){assert.match(html,pattern);assert.match(sw,pattern)}assert.match(sw,/obsremote-v5-1-rc1/)});
test('private API and media are excluded from service worker cache',()=>{assert.match(sw,/startsWith\('\/api\/'\)/);assert.match(sw,/startsWith\('\/internal\/'\)/)});
test('stream key field is password input',()=>{assert.match(app,/name="streamKey" type="password"/)});
test('floating AI is draggable and minimizable',()=>{assert.match(ui,/pointerdown/);assert.match(ui,/aiMinimize/);assert.match(css,/\.ai-widget\.minimized/)});
test('sound actions render three controls cleanly',()=>{assert.match(css,/\.sound-actions\{grid-template-columns:44px 1fr 1fr/)});
test('rejected remembered PIN is cleared instead of reconnect-looping forever',()=>{assert.match(ui,/recoverBadPin/);assert.match(ui,/incorrect remote pin/);assert.match(ui,/localStorage\.removeItem\('obsremote-pin'\)/)});
test('websocket policy rejection immediately returns to PIN entry',()=>{assert.match(ui,/installWebSocketAuthGuard/);assert.match(ui,/event\.code===1008/);assert.match(ui,/location\.reload\(\)/)});
test('PWA service worker is registered by the client',()=>{assert.match(ui,/navigator\.serviceWorker\.register\('\/service-worker\.js'/);assert.match(ui,/window\.isSecureContext/)});
