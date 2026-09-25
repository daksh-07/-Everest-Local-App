import { useEffect,useMemo,useState } from 'react';
import { Modal,Platform,Pressable,StyleSheet,Text,View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type BusinessWorkspace,getWorkspaceContext,setWorkspacePreference } from '@/lib/workspace';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

export function ModeSwitcher({compact=false}:{compact?:boolean}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [open,setOpen]=useState(false);const [businesses,setBusinesses]=useState<BusinessWorkspace[]>([]);const [mode,setMode]=useState<'CUSTOMER'|'BUSINESS'>('CUSTOMER');const [active,setActive]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!open)return;void getWorkspaceContext().then(ctx=>{setBusinesses(ctx.businesses);setMode(ctx.mode);setActive(ctx.active_business_id)}).catch(()=>undefined);},[open]);
 async function choose(nextMode:'CUSTOMER'|'BUSINESS',businessId:string|null){
  if(busy)return;setBusy(true);
  try{await setWorkspacePreference(nextMode,businessId);if(Platform.OS!=='web')await Haptics.selectionAsync();setMode(nextMode);setActive(businessId);setOpen(false);router.replace(nextMode==='BUSINESS'?'/business-today':'/');}finally{setBusy(false)}
 }
 return <><Pressable accessibilityLabel="Switch mode" onPress={()=>setOpen(true)} style={[s.trigger,compact&&s.compact]}><Ionicons name="swap-horizontal" size={17} color={colors.text}/>{!compact&&<Text style={s.triggerText}>Switch mode</Text>}</Pressable>
 <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><Pressable style={s.backdrop} onPress={()=>setOpen(false)}><View style={s.sheet}><Text style={s.eyebrow}>SWITCH MODE</Text><Text style={s.title}>Choose how you’re using Everest</Text>
 <Pressable disabled={busy} onPress={()=>void choose('CUSTOMER',null)} style={s.row}><View><Text style={s.rowTitle}>Customer</Text><Text style={s.copy}>Discover, request, book, buy and message personally.</Text></View>{mode==='CUSTOMER'&&<Ionicons name="checkmark-circle" size={22} color={colors.brand}/>}</Pressable>
 {businesses.map(b=><Pressable disabled={busy} key={b.id} onPress={()=>void choose('BUSINESS',b.id)} style={s.row}><View style={{flex:1}}><Text style={s.rowTitle}>{b.name}</Text><Text style={s.copy}>Business · {b.member_role} · {b.verification_status}</Text></View>{mode==='BUSINESS'&&active===b.id&&<Ionicons name="checkmark-circle" size={22} color={colors.brand}/>}</Pressable>)}
 {!businesses.length&&<Pressable onPress={()=>{setOpen(false);router.push('/business-onboarding')}} style={s.row}><View><Text style={s.rowTitle}>Run your business on Everest</Text><Text style={s.copy}>Create or claim a business before Business Mode is available.</Text></View><Ionicons name="arrow-forward" size={20} color={colors.text}/></Pressable>}
 </View></Pressable></Modal></>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({trigger:{minHeight:40,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:12,flexDirection:'row',gap:7,alignItems:'center'},compact:{width:40,paddingHorizontal:0,justifyContent:'center'},triggerText:{fontSize:11,fontWeight:'800',color:c.text},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.48)',justifyContent:'flex-end'},sheet:{backgroundColor:c.elevated,borderTopLeftRadius:26,borderTopRightRadius:26,padding:20,paddingBottom:34,borderWidth:1,borderColor:c.border},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.muted},title:{fontSize:23,fontWeight:'900',color:c.text,marginTop:5,marginBottom:12},row:{minHeight:72,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,marginTop:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},rowTitle:{fontSize:14,fontWeight:'900',color:c.text},copy:{fontSize:11,lineHeight:17,color:c.muted,marginTop:3}});
