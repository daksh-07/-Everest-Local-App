import {useEffect} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {router} from 'expo-router';
import {businessHomeRoute,getWorkspaceContext} from '@/lib/workspace';
import {useAppTheme} from '@/lib/theme';

export default function BusinessDashboard(){
 const {colors}=useAppTheme();
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const ctx=await getWorkspaceContext();
    if(!active)return;
    if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){router.replace('/business-onboarding');return;}
    const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);
    if(!current){router.replace('/business-onboarding');return;}
    router.replace(businessHomeRoute(current));
   }catch{
    if(active)router.replace('/business-onboarding');
   }
  })();
  return()=>{active=false};
 },[]);
 return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.canvas}}><ActivityIndicator color={colors.brand}/></View>;
}
