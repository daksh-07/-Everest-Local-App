import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {URL} from 'node:url';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const experience=read('lib/experience.tsx');
const theme=read('lib/theme.tsx');
const layout=read('app/_layout.tsx');
const appearance=read('app/appearance.tsx');

test('experience modes are centralized, persisted, and independent from colour',()=>{
 for(const mode of ['DEFAULT','PULSE','CLASSIC'])assert.match(experience,new RegExp(`\\b${mode}\\b`));
 assert.match(experience,/everest-local-experience-v1/);
 assert.match(experience,/SecureStore\.setItemAsync/);
 assert.match(experience,/localStorage\?\.setItem/);
 assert.match(theme,/everest-local-theme/);
 assert.doesNotMatch(experience,/ThemePreference|isDark|colorScheme/);
});

test('root composes one experience provider over existing workflows',()=>{
 assert.match(layout,/<ThemeProvider><ExperienceProvider><ThemedRootLayout\/><\/ExperienceProvider><\/ThemeProvider>/);
 assert.equal((layout.match(/<Stack /g)??[]).length,1);
});

test('all experience and colour combinations are user selectable',()=>{
 for(const value of ["value:'DEFAULT'","value:'PULSE'","value:'CLASSIC'","value:'SYSTEM'","value:'LIGHT'","value:'DARK'"])assert.ok(appearance.includes(value),value);
 assert.match(appearance,/Experience and colour are independent/);
 assert.match(appearance,/reduced-motion setting/);
});

test('mode changes stay in presentation and do not touch marketplace data',()=>{
 assert.doesNotMatch(experience,/supabase|service_requests|bookings|quotes|payments|stripe/i);
 assert.match(experience,/typography:/);
 assert.match(experience,/spacing:/);
 assert.match(experience,/motion:/);
 assert.match(experience,/navigation:/);
 assert.match(experience,/surfaces:/);
});
