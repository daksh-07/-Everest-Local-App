import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CUSTOMER_PAGES,pageForRoute,settlePage,tabForProgress} from '../lib/customer-page-model.ts';

const shell=fs.readFileSync('components/GlobalSwipeNavigator.tsx','utf8');
const explore=fs.readFileSync('app/social.tsx','utf8');
const messages=fs.readFileSync('app/messages.tsx','utf8');

test('left advances and right reverses through six retained scenes',()=>{
 assert.deepEqual(CUSTOMER_PAGES,['/','/social?mode=posts','/social?mode=clips','/activity','/messages','/account']);
 for(let index=0;index<5;index++)assert.equal(settlePage(index,-125,0,375),index+1);
 for(let index=1;index<6;index++)assert.equal(settlePage(index,125,0,375),index-1);
 assert.equal(settlePage(0,125,0,375),0);
 assert.equal(settlePage(5,-125,0,375),5);
});
test('a short accidental drag cancels and a fast flick can skip one scene',()=>{
 assert.equal(settlePage(1,-24,0,375),1);
 assert.equal(settlePage(3,25,100,375),3);
 assert.equal(settlePage(1,-25,-1450,375),3);
 assert.equal(settlePage(4,25,1450,375),2);
});
test('deep links and the five-destination tab projection resolve continuously',()=>{
 assert.equal(pageForRoute('/social','clips'),2);
 assert.equal(pageForRoute('/messages'),4);
 assert.equal(pageForRoute('/account'),5);
 assert.equal(pageForRoute('/booking'),null);
 assert.equal(tabForProgress(1.5),1);
 assert.equal(tabForProgress(2.5),1.5);
 assert.equal(tabForProgress(4),3);
});
test('pager lazily mounts nearby scenes and retains them after first visit',()=>{
 assert.match(shell,/sceneWindow\(page:number\)/);
 assert.match(shell,/useState<Set<number>>\(\(\)=>sceneWindow\(routePage\?\?0\)\)/);
 assert.match(shell,/mountSceneWindow\(target\)/);
 assert.match(shell,/mountedPages\.has\(0\)\?<HomeScreen/);
 assert.match(shell,/mountedPages\.has\(4\)\?<MessagesScreen/);
 assert.doesNotMatch(shell,/mountedPages\.delete|setMountedPages\(new Set/);
});
test('pager does not set React state during frames; route follows spring completion',()=>{
 const gesture=shell.slice(shell.indexOf('.onUpdate(event=>'),shell.indexOf('.onEnd(event=>'));
 assert.doesNotMatch(gesture,/setSelected|router\.|setState/);
 assert.match(shell,/withSpring\(target,[\s\S]*if\(finished\)[\s\S]*runOnJS\(commit\)/);
 assert.match(shell,/HomeScreen visible=[\s\S]*SocialScreen sceneMode="POSTS"[\s\S]*SocialScreen sceneMode="CLIPS"[\s\S]*MessagesScreen\/>/);
 assert.match(explore,/active&&clipSettled&&activeClipId===item\.id/);
});
test('Messages loading, empty, and error layouts and native swipe reply survive',()=>{
 assert.match(messages,/ConversationSkeleton/);
 assert.match(messages,/No messages yet/);
 assert.match(messages,/Tap to retry/);
 assert.match(messages,/SwipeReplyBubble/);
 assert.match(messages,/runOnJS\(onReply\)\(message\)/);
 assert.match(messages,/everest-message-composer/);
});
