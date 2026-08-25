import test from 'node:test';
import assert from 'node:assert/strict';
import {ObsManagerPool} from '../lib/obs-manager.js';

test('OBS manager pool validates configured target ids',async()=>{const pool=new ObsManagerPool([{id:'main',name:'Main',url:'ws://127.0.0.1:4455',password:''}]);assert.equal(pool.has('main'),true);assert.equal(pool.has('missing'),false);assert.equal(pool.require('main').target.name,'Main');assert.throws(()=>pool.require('missing'),/Unknown OBS target/);await pool.close()});
test('fallback get remains deterministic for internal default selection',async()=>{const pool=new ObsManagerPool([{id:'a',name:'A',url:'ws://127.0.0.1:4455',password:''},{id:'b',name:'B',url:'ws://127.0.0.1:4456',password:''}]);assert.equal(pool.get('missing').target.id,'a');await pool.close()});
