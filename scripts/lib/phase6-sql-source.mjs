import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
// Match only canonical timestamp migrations, never generated legacy aliases.
export async function latestFunction(name){
 let result;
 for(const file of execFileSync('git',['ls-files','supabase/migrations/*.sql'],{encoding:'utf8'}).trim().split('\n').map(path=>path.split('/').at(-1)).filter(file=>/^\d{14}_.*\.sql$/.test(file)).sort()){
  const source=await fs.readFile('supabase/migrations/'+file,'utf8');const marker='create or replace function public.'+name+'(';const start=source.toLowerCase().indexOf(marker);
  if(start>=0){const delimiter=source.slice(start).match(/\bas\s+(\$[a-zA-Z_]*\$)/i)?.[1];if(!delimiter)throw new Error('Unsupported function delimiter: '+file);const end=source.indexOf(delimiter+';',source.indexOf(delimiter,start)+delimiter.length);if(end<0)throw new Error('Unclosed function: '+file);result={file,sql:source.slice(start,end+delimiter.length+1)};}
 }
 if(!result)throw new Error('Function not found: '+name);return result;
}
