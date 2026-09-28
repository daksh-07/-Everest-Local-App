import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';
import {useExperience} from '@/lib/experience';
import {getWorkspaceContext,type BusinessWorkspace,isWorkforceWorkspace} from '@/lib/workspace';

type PrimaryRoute='/business-today'|'/business-crm'|'/business-calendar'|'/business-inbox'|'/business-control'|'/business-my-work'|'/business-jobs'|'/business-operations';
export type BusinessActiveRoute=
 |PrimaryRoute
 |'/business-leads'
 |'/business-customers'
 |'/business-customer'
 |'/business-deal'
 |'/business-crm-quote'
 |'/business-crm-booking'
 |'/business-job'
 |'/business-availability'
 |'/business-orders';

type IconName=keyof typeof Ionicons.glyphMap;
type Item={route:PrimaryRoute;label:string;icon:IconName;activeIcon:IconName};
const managementItems:ReadonlyArray<Item>=[
 {route:'/business-today',label:'Today',icon:'today-outline',activeIcon:'today'},
 {route:'/business-jobs',label:'Jobs',icon:'briefcase-outline',activeIcon:'briefcase'},
 {route:'/business-calendar',label:'Calendar',icon:'calendar-outline',activeIcon:'calendar'},
 {route:'/business-inbox',label:'Inbox',icon:'chatbubbles-outline',activeIcon:'chatbubbles'},
 {route:'/business-control',label:'Business',icon:'storefront-outline',activeIcon:'storefront'},
];
const workItems:ReadonlyArray<Item>=[
 {route:'/business-my-work',label:'Work',icon:'briefcase-outline',activeIcon:'briefcase'},
 {route:'/business-inbox',label:'Inbox',icon:'chatbubbles-outline',activeIcon:'chatbubbles'},
 {route:'/business-operations',label:'Team',icon:'people-outline',activeIcon:'people'},
 {route:'/business-control',label:'Business',icon:'storefront-outline',activeIcon:'storefront'},
];

function itemsFor(business:BusinessWorkspace|null):ReadonlyArray<Item>{
 if(!business)return managementItems;
 if(isWorkforceWorkspace(business)||!business.can_view_crm){
  if(String(business.member_role).toUpperCase()==='FINANCE')return [workItems[3]];
  if(String(business.member_role).toUpperCase()==='READ_ONLY')return [workItems[2],workItems[3]];
  return workItems;
 }
 return managementItems;
}
function primaryFor(active:BusinessActiveRoute,items:ReadonlyArray<Item>):PrimaryRoute{
 const routes=new Set(items.map(x=>x.route));
 if(active==='/business-crm'&&!routes.has('/business-crm'))return'/business-control';
 if(['/business-leads','/business-customers','/business-customer','/business-deal','/business-crm-quote','/business-crm-booking'].includes(active))return routes.has('/business-crm')?'/business-crm':'/business-control';
 if(active==='/business-job')return routes.has('/business-jobs')?'/business-jobs':routes.has('/business-calendar')?'/business-calendar':'/business-my-work';
 if(active==='/business-availability'||active==='/business-orders')return'/business-control';
 if(active==='/business-operations'&&!routes.has('/business-operations'))return'/business-control';
 if(active==='/business-my-work'&&!routes.has('/business-my-work'))return routes.has('/business-today')?'/business-today':'/business-control';
 return active as PrimaryRoute;
}

export function BusinessTabBar({active}:{active:BusinessActiveRoute}){
 const insets=useSafeAreaInsets();const {colors}=useAppTheme();const {tokens:t,mode}=useExperience();
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);
 useEffect(()=>{let mounted=true;void getWorkspaceContext().then(ctx=>{if(!mounted)return;setBusiness(ctx.businesses.find(x=>x.id===ctx.active_business_id)??null)}).catch(()=>undefined);return()=>{mounted=false}},[]);
 const items=useMemo(()=>itemsFor(business),[business]);const selectedRoute=primaryFor(active,items);
 return <View style={[s.shell,{height:t.navigation.height+insets.bottom,paddingBottom:insets.bottom,backgroundColor:colors.navigation,borderTopColor:colors.border,borderTopWidth:t.surfaces.borderWidth}]}>
  <View style={[s.bar,{height:t.navigation.height}]}>{items.map(item=>{const selected=item.route===selectedRoute;return <Pressable key={item.route} accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={item.label} onPress={()=>{if(!selected)router.replace(item.route)}} style={({pressed})=>[s.item,{minHeight:t.controls.touchTarget,borderRadius:t.shape.small,backgroundColor:selected&&mode==='PULSE'?colors.accentSoft:'transparent'},pressed&&s.pressed]}><Ionicons name={selected?item.activeIcon:item.icon} size={t.navigation.iconSize} color={selected?colors.brand:colors.muted}/><Text style={[s.label,{fontSize:t.navigation.labelSize,color:selected?colors.text:colors.muted},selected&&s.active]}>{item.label}</Text></Pressable>})}</View>
 </View>;
}
const s=StyleSheet.create({shell:{position:'absolute',left:0,right:0,bottom:0,zIndex:50,borderTopWidth:1},bar:{height:64,width:'100%',maxWidth:980,alignSelf:'center',flexDirection:'row',justifyContent:'space-around',alignItems:'center'},item:{minWidth:58,minHeight:56,alignItems:'center',justifyContent:'center',paddingHorizontal:5},pressed:{opacity:.58},label:{fontSize:10,lineHeight:14,fontWeight:'700',marginTop:3},active:{fontWeight:'900'}});
