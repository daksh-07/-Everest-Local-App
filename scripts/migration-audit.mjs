import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=join(process.cwd(),'supabase','migrations');
const files=(await readdir(root)).filter(name=>/^\d{3}_.+\.sql$/.test(name)).sort();
const versions=files.map(name=>Number(name.slice(0,3)));
const failures=[];
if(!files.length)failures.push('No numbered Supabase migrations found.');
for(let i=0;i<versions.length;i++){const expected=i+1;if(versions[i]!==expected)failures.push(`Migration sequence gap or duplicate at ${expected}: found ${versions[i]??'none'}.`);}
const sql=await Promise.all(files.map(async name=>[name,await readFile(join(root,name),'utf8')]));
for(const [name,content] of sql){if(!content.trim())failures.push(`${name} is empty.`);if(/create\s+function|create\s+or\s+replace\s+function/i.test(content)&&/security\s+definer/i.test(content)&&!/set\s+search_path\s*=\s*public/i.test(content))failures.push(`${name} contains a SECURITY DEFINER function without an explicit public search_path.`);}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Migration audit passed: ${files.length} ordered migrations checked (001-${String(files.length).padStart(3,'0')}).`);
