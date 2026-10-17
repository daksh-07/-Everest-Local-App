import test from 'node:test';
import assert from 'node:assert/strict';
import {composerInputHeight,chatViewport,COMPOSER_INPUT_MIN,COMPOSER_INPUT_MAX} from '../lib/chat-layout.ts';
test('composer expands and shrinks within a readable, scrollable range',()=>{
 assert.equal(composerInputHeight(0),COMPOSER_INPUT_MIN);
 assert.equal(composerInputHeight(58),58);
 assert.equal(composerInputHeight(500),COMPOSER_INPUT_MAX);
 assert.equal(composerInputHeight(36),36);
 assert.equal(composerInputHeight(NaN),36);
});
test('keyboard and accessory occlusion are deducted exactly once',()=>{
 assert.deepEqual(chatViewport(844,420,35),{height:420,offsetTop:35,keyboardInset:389});
 assert.deepEqual(chatViewport(844,844,0),{height:844,offsetTop:0,keyboardInset:0});
 assert.deepEqual(chatViewport(420,420,0),{height:420,offsetTop:0,keyboardInset:0});
});
test('pinch zoom is not interpreted as keyboard activation',()=>{
 assert.equal(chatViewport(844,420,0,2).keyboardInset,0);
});

import fs from 'node:fs';
test('the production SPA and router HTML both load the tested keyboard stylesheet',()=>{
 for(const path of ['public/index.html','app/+html.tsx'])assert.match(fs.readFileSync(path,'utf8'),/href="\/chat-layout\.css"/);
 const css=fs.readFileSync('public/chat-layout.css','utf8');
 assert.match(css,/height: var\(--everest-visual-height, 100dvh\)/);
 assert.match(css,/top: var\(--everest-visual-top, 0px\)/);
 assert.doesNotMatch(css,/padding-bottom:.*keyboard|translateY/);
});
