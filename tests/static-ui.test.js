import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');

test('every literal #id queried by app.js exists in index.html',()=>{const ids=[...app.matchAll(/\$\(['"]#([A-Za-z0-9_-]+)['"]\)/g)].map(m=>m[1]);const missing=[...new Set(ids)].filter(id=>!new RegExp(`id=["']${id}["']`).test(html));assert.deepEqual(missing,[])});
test('navigation tabs have matching views',()=>{const tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);const views=[...html.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual([...new Set(tabs)].sort(),[...new Set(views)].sort())});
test('HTML and service worker reference the same release assets',()=>{assert.match(html,/styles\.css\?v=50/);assert.match(html,/app\.js\?v=50/);assert.match(sw,/styles\.css\?v=50/);assert.match(sw,/app\.js\?v=50/);assert.match(sw,/obsremote-v5-rc1/)});
test('private API and media are excluded from service worker cache',()=>{assert.match(sw,/startsWith\('\/api\/'\)/);assert.match(sw,/startsWith\('\/internal\/'\)/)});
test('stream key field is password input',()=>{assert.match(app,/name=\\"streamKey\\" type=\\"password\\"/)});
