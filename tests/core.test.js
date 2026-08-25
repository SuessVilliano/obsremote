import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {clamp,safeText,isRtmpUrl,audioExtension,looksLikeAudio,sealText,openText,timingSafeEqualText,uniqueStrings} from '../lib/core.js';

test('clamp validates numeric ranges',()=>{assert.equal(clamp(150,0,100,25),100);assert.equal(clamp(-2,0,100,25),0);assert.equal(clamp('bad',0,100,25),25)});
test('safeText strips control/html delimiters and limits length',()=>{assert.equal(safeText('<abc>\u0000',3),'abc');assert.equal(safeText(' hello '),'hello')});
test('RTMP validator accepts only RTMP schemes with hosts',()=>{assert.equal(isRtmpUrl('rtmp://example.com/live'),true);assert.equal(isRtmpUrl('rtmps://example.com/app'),true);assert.equal(isRtmpUrl('https://example.com'),false);assert.equal(isRtmpUrl('rtmp:///missing'),false)});
test('audio extensions are allow-listed',()=>{assert.equal(audioExtension('audio/mpeg','track.mp3'),'.mp3');assert.equal(audioExtension('application/octet-stream','payload.exe'),'');assert.equal(audioExtension('audio/wav','x'),'.wav')});
test('basic audio signatures are checked',()=>{assert.equal(looksLikeAudio(Buffer.from('RIFF0000WAVEfmt '),'.wav'),true);assert.equal(looksLikeAudio(Buffer.from('not audio at all'),'.wav'),false);assert.equal(looksLikeAudio(Buffer.from([0x49,0x44,0x33,0,0]),'.mp3'),true)});
test('secret sealing round trips and does not expose plaintext',()=>{const key=crypto.randomBytes(32),sealed=sealText('stream-key-secret',key);assert.ok(sealed.startsWith('v1.'));assert.equal(sealed.includes('stream-key-secret'),false);assert.equal(openText(sealed,key),'stream-key-secret')});
test('timing safe compare handles unequal lengths',()=>{assert.equal(timingSafeEqualText('1234','1234'),true);assert.equal(timingSafeEqualText('1234','12345'),false)});
test('uniqueStrings de-duplicates and removes empty values',()=>{assert.deepEqual(uniqueStrings([' a ','a','','b']),['a','b'])});
