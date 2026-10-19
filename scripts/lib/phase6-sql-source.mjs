import fs from 'node:fs/promises';
// Match only canonical timestamp migrations, never generated legacy aliases.
export async function latestFunction(name){
 let result;
 for(const file of (await fs.readdir('supabase/migrations')).filter(file=>/^\d{14}_.*\.sql$/.test(file)).sort()){
  const source=await fs.readFile('supabase/migrations/'+file,'utf8');const marker='create or replace function public.'+name+'(';const start=source.toLowerCase().indexOf(marker);
  if(start>=0){const end=source.indexOf('$$;',start);if(end<0)throw new Error('Unsupported function delimiter: '+file);result={file,sql:source.slice(start,end+3)};}
 }
 if(!result)throw new Error('Function not found: '+name);return result;
}
