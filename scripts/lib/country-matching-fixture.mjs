// Only for the existing disposable PostgreSQL/PGlite fixtures, never a hosted project.
import fs from 'node:fs/promises';
import {latestFunction} from './phase6-sql-source.mjs';
export async function installCountryMatchingFixture(db){
 const file=(await fs.readdir('supabase/migrations')).find(name=>name.endsWith('_marketplace_country_matching_guard.sql'));
 if(!file)throw new Error('Country matching migration is missing');
 const source=await fs.readFile('supabase/migrations/'+file,'utf8');
 // The legacy synthetic fixtures represent an AU request/provider; this is not an application default.
 await db.exec("alter table service_requests add column country text default 'Australia';alter table businesses add column country text default 'Australia';");
 await db.exec(source.slice(0,source.indexOf('-- MATCHING FUNCTIONS:')));
 await db.exec((await latestFunction('release_everest_live_wave')).sql);
}
