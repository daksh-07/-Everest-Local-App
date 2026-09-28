const fs=require('node:fs');

module.exports=({config})=>{
  const android={...(config.android??{})};
  const configuredGoogleServices=process.env.GOOGLE_SERVICES_JSON?.trim()
    ||(fs.existsSync('./google-services.json')?'./google-services.json':'');
  const mapsKey=process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim()||'';

  if(configuredGoogleServices)android.googleServicesFile=configuredGoogleServices;
  if(mapsKey){
    android.config={
      ...(android.config??{}),
      googleMaps:{...((android.config??{}).googleMaps??{}),apiKey:mapsKey},
    };
  }
  return {...config,android};
};
