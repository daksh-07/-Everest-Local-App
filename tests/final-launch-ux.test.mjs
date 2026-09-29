import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {livePresentation} from '../lib/live-presentation.ts';

for(const status of ['BOOKED','PROVIDER_SELECTED','CANCELLED','EXPIRED','NO_PROVIDER_FOUND']){
 test(`${status} never looks like an active Live search`,()=>{
  const state=livePresentation(status);
  assert.equal(state.searching,false);
  assert.equal(state.terminal,true);
  assert.doesNotMatch(state.label,/active/i);
 });
}
test('loading, responses and disconnected states do not animate searching',()=>{
 for(const state of [livePresentation(null),livePresentation('RESPONSES_AVAILABLE'),livePresentation('SEARCHING',true)])assert.equal(state.searching,false);
 assert.equal(livePresentation('NOTIFYING').searching,true);
});
test('retained scenes preserve state and exclude inactive controls from accessibility and keyboard focus',()=>{
 const source=fs.readFileSync('components/GlobalSwipeNavigator.tsx','utf8');
 assert.equal((source.match(/accessibilityElementsHidden=/g)||[]).length,6);
 assert.equal((source.match(/importantForAccessibility=/g)||[]).length,6);
 assert.match(source,/scene\.inert=routePage===null\|\|selected!==index/);
 assert.match(source,/display:routePage===null\?'none':'flex'/);
 assert.match(fs.readFileSync('app/_layout.tsx','utf8'),/GlobalSwipeNavigator key=\{sessionUserId\?\?'guest'\}/);
});
test('web zoom remains available and small-input iOS autozoom is prevented by readable fields',()=>{
 const html=fs.readFileSync('app/+html.tsx','utf8');
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
 assert.match(html,/font-size: 16px !important/);
 assert.match(html,/prefers-reduced-motion: reduce/);
});
