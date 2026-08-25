import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MUSIC_STATE,normalizePlaylist,selectIndex,advanceState,startPlaylist} from '../lib/music.js';

test('playlist normalization removes unknown and duplicate tracks',()=>{const p=normalizePlaylist({id:'p1',name:' Test ',trackIds:['a','x','a','b'],volume:150,scenes:['BRB','BRB']},['a','b']);assert.deepEqual(p.trackIds,['a','b']);assert.equal(p.volume,100);assert.deepEqual(p.scenes,['BRB'])});
test('ordered selection wraps only when loop enabled',()=>{assert.equal(selectIndex(3,2,1,{loop:true}),0);assert.equal(selectIndex(3,2,1,{loop:false}),null);assert.equal(selectIndex(3,0,-1,{loop:false}),null)});
test('shuffle does not intentionally repeat current item',()=>{const idx=selectIndex(3,1,1,{shuffle:true,random:()=>0});assert.notEqual(idx,1)});
test('startPlaylist starts first ordered track with playlist defaults',()=>{const s=startPlaylist(DEFAULT_MUSIC_STATE,{id:'p',trackIds:['a','b'],shuffle:false,loop:true,volume:33});assert.equal(s.trackId,'a');assert.equal(s.playlistId,'p');assert.equal(s.volume,33);assert.equal(s.playing,true)});
test('advanceState stops at playlist end when loop disabled',()=>{const s={...DEFAULT_MUSIC_STATE,trackId:'b',index:1,playlistId:'p',loop:false,playing:true};const next=advanceState(s,{id:'p',trackIds:['a','b'],loop:false},1);assert.equal(next.playing,false);assert.equal(next.position,0)});
