import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClip,clipWindow} from '../lib/audio-clip.js';

test('normalizeClip keeps full-file defaults',()=>{
  assert.deepEqual(normalizeClip(),{clipStart:0,clipEnd:null,fadeIn:0,fadeOut:0});
});

test('normalizeClip clamps invalid trim values and fade lengths',()=>{
  const x=normalizeClip({clipStart:-4,clipEnd:4,fadeIn:9,fadeOut:9});
  assert.equal(x.clipStart,0);
  assert.equal(x.clipEnd,4);
  assert.equal(x.fadeIn,2);
  assert.equal(x.fadeOut,2);
});

test('normalizeClip preserves existing values on partial patch',()=>{
  const current={clipStart:10,clipEnd:20,fadeIn:1,fadeOut:2};
  const x=normalizeClip({fadeOut:3},current);
  assert.deepEqual(x,{clipStart:10,clipEnd:20,fadeIn:1,fadeOut:3});
});

test('clipWindow constrains saved trim to decoded duration',()=>{
  const x=clipWindow({clipStart:8,clipEnd:30,fadeIn:1,fadeOut:1},12);
  assert.equal(x.clipStart,8);
  assert.equal(x.clipEnd,12);
});
