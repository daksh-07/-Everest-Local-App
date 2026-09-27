import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const soundMigration=read('supabase/migrations/20260927150000_everest_studio_sound_system.sql');
const reuseMigration=read('supabase/migrations/20260927151000_reusable_public_sounds.sql');
const soundPicker=read('components/SoundPicker.tsx');
const audioStudio=read('lib/audio-studio.ts');
const createClip=read('app/create-clip.tsx');
const createPost=read('app/create-post.tsx');
const social=read('app/social.tsx');
const soundPage=read('app/sound.tsx');

test('sound storage is private and owned writes are scoped to the signed-in user',()=>{
 assert.match(soundMigration,/insert into storage\.buckets[\s\S]*'user-audio','user-audio',false/);
 assert.match(soundMigration,/bucket_id='user-audio' and \(storage\.foldername\(name\)\)\[1\]=\(select auth\.uid\(\)\)::text/);
 assert.match(soundMigration,/alter table public\.audio_assets enable row level security/);
 assert.match(soundMigration,/alter table public\.post_audio_tracks enable row level security/);
});

test('uploaded audio requires rights confirmation before registration',()=>{
 assert.match(soundMigration,/p_source_type='USER_UPLOAD' and not coalesce\(p_rights_confirmed,false\)/);
 assert.match(audioStudio,/Confirm that you own or have permission to use this audio/);
 assert.match(soundPicker,/I own or have permission to use this audio/);
});

test('reusable sounds require an explicitly reusable public published source',()=>{
 assert.match(reuseMigration,/aid\.reusable and exists/);
 assert.match(reuseMigration,/source_post\.status='PUBLISHED'/);
 assert.match(reuseMigration,/source_post\.visibility='PUBLIC'/);
 assert.match(reuseMigration,/raise exception 'Not authorized to use this sound'/);
});

test('Add Sound exposes music original upload and voiceover',()=>{
 for(const label of ['Music','Original','Upload','Voiceover'])assert.match(soundPicker,new RegExp("'"+label+"'"));
 assert.match(soundPicker,/requestRecordingPermissionsAsync/);
 assert.match(soundPicker,/pickUserAudio/);
 assert.match(soundPicker,/USE ORIGINAL ONLY/);
});

test('clips and photo posts publish generalized sound tracks',()=>{
 assert.match(createClip,/publishDraftSound/);
 assert.match(createClip,/hasOriginalAudio/);
 assert.match(createPost,/publishDraftSound/);
 assert.match(createPost,/setPhotoPostDuration/);
 assert.match(createPost,/PhotoSoundPreview/);
});

test('Explore hydrates generalized sound tracks and reusable sound navigation',()=>{
 assert.match(social,/listPostAudioTracks/);
 assert.match(social,/PostSoundPlayer/);
 assert.match(social,/\/sound\?id=/);
 assert.match(soundPage,/USE IN CLIP/);
 assert.match(soundPage,/USE WITH PHOTO/);
});
