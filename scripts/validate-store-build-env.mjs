import fs from 'node:fs';

const profile=String(process.env.EAS_BUILD_PROFILE??'');
const platform=String(process.env.EAS_BUILD_PLATFORM??'');
if(profile!=='production')process.exit(0);

const failures=[];
if(platform==='android'){
  const googleServices=String(process.env.GOOGLE_SERVICES_JSON??'').trim()
    ||(fs.existsSync('./google-services.json')?'./google-services.json':'');
  const mapsKey=String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY??'').trim();

  if(!googleServices)failures.push('GOOGLE_SERVICES_JSON (or ./google-services.json) is required for Android FCM registration.');
  else if(!fs.existsSync(googleServices))failures.push('GOOGLE_SERVICES_JSON points to a file that does not exist on the EAS worker.');
  if(!mapsKey)failures.push('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY is required for the native Android map.');
}
if(failures.length){
  console.error('\nEverest Local production build blocked:\n- '+failures.join('\n- ')+'\n');
  process.exit(1);
}
console.log('Everest Local production native prerequisites passed for '+platform+'.');
