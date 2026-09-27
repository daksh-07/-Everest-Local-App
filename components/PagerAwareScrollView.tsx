import {useMemo,type ComponentProps} from 'react';
import {Platform,ScrollView as NativeScrollView} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import {useCustomerPager} from '@/lib/customer-pager';

// On native, a carousel owns horizontal touches that start inside its bounds.
// The outer scene pan still owns swipes elsewhere; vertical feeds remain free.
export function PagerAwareScrollView(props:ComponentProps<typeof NativeScrollView>){
 const pager=useCustomerPager();
 const nativeGesture=useMemo(()=>{
  const native=Gesture.Native();
  if(pager)native.blocksExternalGesture(pager.panGesture);
  return native;
 },[pager]);
 if(!pager||!props.horizontal||Platform.OS==='web')return <NativeScrollView {...props}/>;
 return <GestureDetector gesture={nativeGesture}><NativeScrollView {...props}/></GestureDetector>;
}
