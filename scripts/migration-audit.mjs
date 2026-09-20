import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=join(process.cwd(),'supabase','migrations');
const files=(await readdir(root)).filter(name=>/^(?:\d{3}|\d{14})_.+\.sql$/.test(name)).sort();
const legacy=files.filter(name=>/^\d{3}_.+\.sql$/.test(name));
const timestamped=files.filter(name=>/^\d{14}_.+\.sql$/.test(name));
const versions=legacy.map(name=>Number(name.slice(0,3)));
const failures=[];
if(!files.length)failures.push('No Supabase migrations found.');
for(let i=0;i<versions.length;i++){const expected=i+1;if(versions[i]!==expected)failures.push(`Legacy migration sequence gap or duplicate at ${expected}: found ${versions[i]??'none'}.`);}
if(legacy.length!==34)failures.push(`Expected exactly 34 legacy numbered migrations (001-034), found ${legacy.length}.`);
const migrationVersions=files.map(name=>name.slice(0,name.indexOf('_')));
if(new Set(migrationVersions).size!==migrationVersions.length)failures.push('Duplicate Supabase migration versions found.');
for(const name of timestamped){if(!/^\d{14}_.+\.sql$/.test(name))failures.push(`${name} has an invalid timestamped migration version.`);}
const sql=await Promise.all(files.map(async name=>[name,await readFile(join(root,name),'utf8')]));
for(const [name,content] of sql){if(!content.trim())failures.push(`${name} is empty.`);if(/create\s+function|create\s+or\s+replace\s+function/i.test(content)&&/security\s+definer/i.test(content)&&!/set\s+search_path\s*(?:=|to)\s*(?:public|''|'public')/i.test(content))failures.push(`${name} contains a SECURITY DEFINER function without an explicit public search_path.`);}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Migration audit passed: ${files.length} migrations checked (${legacy.length} legacy + ${timestamped.length} timestamped).`);
