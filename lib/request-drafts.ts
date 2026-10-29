import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {createRequestDraftStore} from './request-draft-store';
export {hasPastRequestedTime,type RequestDraft} from './request-draft-store';
export const requestDrafts=createRequestDraftStore({
 async get(key){return Platform.OS==='web'?globalThis.localStorage.getItem(key):SecureStore.getItemAsync(key)},
 async set(key,value){if(Platform.OS==='web')globalThis.localStorage.setItem(key,value);else await SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY})},
 async remove(key){if(Platform.OS==='web')globalThis.localStorage.removeItem(key);else await SecureStore.deleteItemAsync(key)},
});
