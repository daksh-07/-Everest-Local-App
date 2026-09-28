import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=JSON.parse(fs.readFileSync('app.json','utf8')).expo;
const eas=JSON.parse(fs.readFileSync('eas.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const config=fs.readFileSync('app.config.js','utf8');
const push=fs.readFileSync('lib/push-notifications.native.ts','utf8');
const upgrade=fs.readFileSync('app/business-upgrade.tsx','utf8');
const validator=fs.readFileSync('scripts/validate-store-build-env.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/validate-ios-native.yml','utf8');

test('store identifiers and production profiles are explicit',()=>{
 assert.equal(app.ios.bundleIdentifier,'com.everestlocal.app');
 assert.equal(app.android.package,'com.everestlocal.app');
 assert.equal(app.scheme,'everestlocal');
 assert.equal(app.ios.supportsTablet,false);
 assert.equal(app.ios.config.usesNonExemptEncryption,false);
 assert.equal(eas.build.production.distribution,'store');
 assert.equal(eas.build.production.android.buildType,'app-bundle');
 assert.equal(eas.build.production.autoIncrement,true);
 assert.equal(eas.build.production.environment,'production');
});

test('native icon, adaptive icon, splash and notification assets are configured',()=>{
 assert.equal(app.icon,'./assets/icon.png');
 assert.equal(app.splash.image,'./assets/splash-icon.png');
 assert.equal(app.android.adaptiveIcon.foregroundImage,'./assets/adaptive-icon.png');
 assert.equal(app.android.adaptiveIcon.monochromeImage,'./assets/notification-icon.png');
 for(const path of ['./assets/icon.png','./assets/splash-icon.png','./assets/adaptive-icon.png','./assets/notification-icon.png']){
  assert.ok(fs.existsSync(path),path+' must exist');
 }
});

test('production push entitlement and Android channel metadata are build-time configured',()=>{
 const plugin=app.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-notifications');
 assert.ok(plugin);
 assert.equal(plugin[1].mode,'production');
 assert.equal(plugin[1].defaultChannel,'everest-live');
 assert.equal(plugin[1].icon,'./assets/notification-icon.png');
 assert.equal(plugin[1].enableBackgroundRemoteNotifications,false);
 assert.equal(pkg.dependencies['expo-notifications'],'~0.32.17');
 assert.match(workflow,/aps-environment/);
 assert.match(workflow,/production/);
 assert.match(workflow,/android\.permission\.POST_NOTIFICATIONS/);
});

test('push registration requires an EAS project id instead of ambiguous fallback',()=>{
 assert.match(push,/Missing EAS project id/);
 assert.match(push,/getExpoPushTokenAsync\(\{projectId\}\)/);
 assert.doesNotMatch(push,/projectId\?\{projectId\}:undefined/);
});

test('native store builds do not route digital Everest Pro purchase through Stripe',()=>{
 assert.match(upgrade,/const nativeStore=Platform\.OS==='ios'\|\|Platform\.OS==='android'/);
 assert.match(upgrade,/if\(!businessId\|\|nativeStore\)return/);
 assert.match(upgrade,/nativeStore\?/);
 assert.match(upgrade,/Everest Pro purchasing is not offered through this store build yet/);
});

test('Android native map and FCM config come only from release environment',()=>{
 assert.match(config,/EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY/);
 assert.match(config,/GOOGLE_SERVICES_JSON/);
 assert.match(config,/googleMaps/);
 assert.match(config,/googleServicesFile/);
 assert.doesNotMatch(config,/AIza[0-9A-Za-z_-]{20,}/);
 assert.match(validator,/EAS_BUILD_PROFILE/);
 assert.match(validator,/EAS_BUILD_PLATFORM/);
 assert.match(validator,/production/);
 assert.match(validator,/Google Maps/i);
 assert.match(validator,/FCM/i);
});

test('CI prebuilds both platforms and compiles a release Android bundle',()=>{
 assert.match(workflow,/expo prebuild --platform ios/);
 assert.match(workflow,/expo prebuild --platform android/);
 assert.match(workflow,/bundleRelease/);
 assert.match(workflow,/app-release\.aab/);
});
