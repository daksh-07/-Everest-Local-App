// Offline reconciliation of a read-only production history snapshot. Never repairs history.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='docs/phase7-evidence';
const remote=JSON.parse(await fs.readFile(root+'/remote-migrations.json','utf8'));
const files=execFileSync('git',['ls-files','supabase/migrations/*.sql'],{encoding:'utf8'}).trim().split('\n');
const byVersion=new Map(remote.map(row=>[row.version,row]));
const pending=new Set(['20261018032359_phase5_public_discovery','20261019034703_phase6_live_matching_correctness','20261019035131_phase6_authorized_comment_moderation','20261019035613_phase6_live_request_quote_lifecycle','20261019081535_phase7_quote_acceptance_lock_order']);
const local=[];
for(const file of files){
 const stem=file.split('/').at(-1).slice(0,-4),split=stem.indexOf('_'),version=stem.slice(0,split),name=stem.slice(split+1);
 const source=await fs.readFile(file,'utf8'),applied=byVersion.get(version);
 const exact=applied?.source_md5===createHash('md5').update(source.trim()).digest('hex');
 local.push({file,version,name,sha256:createHash('sha256').update(source).digest('hex'),state:!applied?(pending.has(stem)?'PENDING_RELEASE_GATE':'UNREVIEWED_PENDING'):applied.name!==name?'CONFLICT_VERSION_NAME':exact?'APPLIED_HISTORY_BYTE_MATCH':'APPLIED_HISTORY_CONTENT_UNVERIFIED',remoteName:applied?.name??null});
}
const report={scope:'Version/name and trimmed source fingerprints only; unverified content is not certified equivalent. No database writes.',localCount:local.length,remoteCount:remote.length,counts:Object.fromEntries([...new Set(local.map(row=>row.state))].map(state=>[state,local.filter(row=>row.state===state).length])),local,remoteOnly:remote.filter(row=>!local.some(file=>file.version===row.version))};
await fs.writeFile(root+'/migration-inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({localCount:report.localCount,remoteCount:report.remoteCount,counts:report.counts,remoteOnly:report.remoteOnly.map(row=>({version:row.version,name:row.name}))},null,2));
