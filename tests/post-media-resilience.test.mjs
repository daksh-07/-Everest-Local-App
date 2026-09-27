import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cache=fs.readFileSync('lib/media-url-cache.ts','utf8');
const media=fs.readFileSync('lib/request-post-media.ts','utf8');
const component=fs.readFileSync('components/PostMediaImage.tsx','utf8');
const account=fs.readFileSync('app/account.tsx','utf8');
const home=fs.readFileSync('app/index.tsx','utf8');
const explore=fs.readFileSync('app/social.tsx','utf8');
const profile=fs.readFileSync('app/public-user.tsx','utf8');

test('post media can bypass a stale signed-url cache and report strict failures',()=>{
 assert.match(cache,/force\?null:cachedMediaUrl/);
 assert.match(media,/options\?:\{force\?:boolean;strict\?:boolean\}/);
 assert.match(media,/options\?\.strict&&rows\.some/);
});

test('post photos retry signing instead of silently becoming placeholders',()=>{
 assert.match(component,/signedPostMedia\(postId,\{force:true,strict:true\}\)/);
 assert.match(component,/Photo unavailable/);
 assert.match(component,/Tap to retry/);
});

test('all primary profile and discovery surfaces use resilient post media',()=>{
 for(const source of [account,home,explore,profile])assert.match(source,/PostMediaImage/);
 assert.match(account,/signedPostMediaBatch\(posts\.slice\(0,18\)/);
 assert.match(profile,/signedPostMediaBatch\(content\.map/);
});
