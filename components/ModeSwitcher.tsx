import { useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import {acceptBusinessInvitation,getMyBusinessInvitations,type BusinessInvitation} from '@/lib/business-operations';
import { businessHomeRoute,type BusinessWorkspace,getWorkspaceContext,setWorkspacePreference } from '@/lib/workspace';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

export function ModeSwitcher({compact=false}:{compact?:boolean}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [open,setOpen]=useState(false);const [businesses,setBusinesses]=useState<BusinessWorkspace[]>([]);const [invitations,setInvitations]=useState<BusinessInvitation[]>([]);
 const [mode,setMode]=useState<'CUSTOMER'|'BUSINESS'>('CUSTOMER');const [active,setActive]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{if(!open)return;let mounted=true;setError('');void Promise.all([getWorkspaceContext(),getMyBusinessInvitations().catch(()=>[])]).then(([ctx,invites])=>{if(!mounted)return;setBusinesses(ctx.businesses);setMode(ctx.mode);setActive(ctx.active_business_id);setInvitations(invites)}).catch(e=>mounted&&setError(e instanceof Error?e.message:'Workspace could not be loaded.'));return()=>{mounted=false}},[open]);
 async function choose(nextMode:'CUSTOMER'|'BUSINESS',businessId:string|null){
  if(busy)return;setBusy(true);setError('');
  try{
   await setWorkspacePreference(nextMode,businessId);if(Platform.OS!=='web')await Haptics.selectionAsync();setMode(nextMode);setActive(businessId);setOpen(false);
   if(nextMode==='CUSTOMER'){router.replace('/');return;}
   const selected=businesses.find(b=>b.id===businessId);router.replace(selected?businessHomeRoute(selected):'/business-today');
  }catch(e){setError(e instanceof Error?e.message:'Workspace could not be switched.');}
  finally{setBusy(false)}
 }
 async function accept(invite:BusinessInvitation){
  if(busy)return;setBusy(true);setError('');
  try{
   const businessId=await acceptBusinessInvitation(invite.id);
   const ctx=await getWorkspaceContext();setBusinesses(ctx.businesses);setInvitations(current=>current.filter(x=>x.id!==invite.id));
   await setWorkspacePreference('BUSINESS',businessId);
   const selected=ctx.businesses.find(b=>b.id===businessId);
   if(Platform.OS!=='web')await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
   setOpen(false);router.replace(selected?businessHomeRoute(selected):'/business-my-work');
  }catch(e){setError(e instanceof Error?e.message:'The invitation could not be accepted.');}
  finally{setBusy(false);}
 }
 return <><Pressable accessibilityLabel="Switch mode" onPress={()=>setOpen(true)} style={[s.trigger,compact&&s.compact]}><Ionicons name="swap-horizontal" size={17} color={colors.text}/>{!compact&&<Text style={s.triggerText}>Switch mode</Text>}</Pressable>
 <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><View style={s.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setOpen(false)} accessibilityLabel="Close workspace switcher"/><View style={s.sheet}><View style={s.handle}/><View style={s.sheetHead}><View style={{flex:1}}><Text style={s.eyebrow}>SWITCH MODE</Text><Text style={s.title}>Choose your workspace</Text></View><Pressable onPress={()=>setOpen(false)} style={s.close}><Ionicons name="close" size={19} color={colors.text}/></Pressable></View>
 <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
  <Pressable disabled={busy} onPress={()=>void choose('CUSTOMER',null)} style={s.row}><View style={s.rowIcon}><Ionicons name="person-outline" size={19} color={colors.text}/></View><View style={{flex:1}}><Text style={s.rowTitle}>Customer</Text><Text style={s.copy}>Discover, request, book, buy and message personally.</Text></View>{mode==='CUSTOMER'&&<Ionicons name="checkmark-circle" size={22} color={colors.brand}/>}</Pressable>
  {businesses.map(b=><Pressable disabled={busy} key={b.id} onPress={()=>void choose('BUSINESS',b.id)} style={s.row}><View style={s.rowIcon}><Ionicons name={['TECHNICIAN','CONTRACTOR','TEAM_LEADER','STAFF'].includes(String(b.member_role))?'briefcase-outline':'business-outline'} size={19} color={colors.text}/></View><View style={{flex:1}}><Text style={s.rowTitle}>{b.name}</Text><Text style={s.copy}>{String(b.member_role).replaceAll('_',' ')} · {b.verification_status}</Text></View>{mode==='BUSINESS'&&active===b.id&&<Ionicons name="checkmark-circle" size={22} color={colors.brand}/>}</Pressable>)}
  {invitations.length?<View style={s.inviteSection}><Text style={s.inviteLabel}>BUSINESS INVITATIONS</Text>{invitations.map(invite=><View key={invite.id} style={s.invite}><View style={s.inviteIcon}><Ionicons name="person-add-outline" size={18} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.rowTitle}>{invite.business_name??'Business invitation'}</Text><Text style={s.copy}>{String(invite.member_role).replaceAll('_',' ')} · invited access</Text></View><Pressable disabled={busy} onPress={()=>void accept(invite)} style={s.accept}>{busy?<ActivityIndicator size="small" color={colors.onBrand}/>:<Text style={s.acceptText}>ACCEPT</Text>}</Pressable></View>)}</View>:null}
  {!businesses.length&&!invitations.length&&<Pressable onPress={()=>{setOpen(false);router.push('/business-onboarding')}} style={s.row}><View style={s.rowIcon}><Ionicons name="add" size={20} color={colors.text}/></View><View style={{flex:1}}><Text style={s.rowTitle}>Run your business on Everest</Text><Text style={s.copy}>Create or claim a business before Business Mode is available.</Text></View><Ionicons name="arrow-forward" size={20} color={colors.text}/></Pressable>}
  {error?<Text style={s.error}>{error}</Text>:null}
 </ScrollView></View></View></Modal></>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 trigger:{minHeight:40,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:12,flexDirection:'row',gap:7,alignItems:'center'},compact:{width:40,paddingHorizontal:0,justifyContent:'center'},triggerText:{fontSize:11,fontWeight:'800',color:c.text},
 backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.48)',justifyContent:'flex-end'},sheet:{maxHeight:'78%',backgroundColor:c.elevated,borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:18,paddingTop:9,paddingBottom:24,borderWidth:1,borderColor:c.border},handle:{width:42,height:4,borderRadius:3,backgroundColor:c.border,alignSelf:'center',marginBottom:13},sheetHead:{flexDirection:'row',alignItems:'center',gap:10},close:{width:38,height:38,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},scroll:{paddingBottom:8},
 eyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:c.accent},title:{fontSize:23,fontWeight:'900',color:c.text,marginTop:4,marginBottom:16},row:{minHeight:74,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:13,marginTop:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},rowIcon:{width:40,height:40,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},rowTitle:{fontSize:13,fontWeight:'900',color:c.text},copy:{fontSize:10,lineHeight:15,color:c.muted,marginTop:3},
 inviteSection:{marginTop:18},inviteLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:c.muted},invite:{minHeight:72,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:12,marginTop:8,flexDirection:'row',alignItems:'center',gap:9},inviteIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},accept:{minWidth:70,height:38,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:9},acceptText:{fontSize:8,fontWeight:'900',color:c.onBrand},error:{fontSize:10,lineHeight:15,color:c.danger,marginTop:12,textAlign:'center'},
});
