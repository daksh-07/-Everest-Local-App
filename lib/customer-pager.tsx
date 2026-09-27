import {createContext,useContext} from 'react';
import type {SharedValue} from 'react-native-reanimated';
import type {Gesture} from 'react-native-gesture-handler';

import type {CustomerPage} from './customer-page-model';
export {CUSTOMER_PAGES,pageForRoute,settlePage,tabForProgress} from './customer-page-model';
export type {CustomerPage} from './customer-page-model';
type PagerContextValue={progress:SharedValue<number>;selected:CustomerPage;navigate:(page:CustomerPage)=>void;setThreadOpen:(open:boolean)=>void;panGesture:ReturnType<typeof Gesture.Pan>};
export const CustomerPagerContext=createContext<PagerContextValue|null>(null);
export const CustomerRouteHostContext=createContext(false);
export function useCustomerPager(){return useContext(CustomerPagerContext)}
export function useCustomerRouteHost(){return useContext(CustomerRouteHostContext)}
