import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {acceptBusinessInvitation,getMyBusinessInvitations,type BusinessInvitation} from '@/lib/business-operations';
import {storePendingQuickActionRoute} from '@/lib/quick-actions';
import {supabase} from '@/lib/supabase';
import {useAppTheme,type ThemeColors} from '@/lib/theme';
import {businessHomeRoute,getWorkspaceContext,setWorkspacePreference} from '@/lib/workspace';

export default function BusinessInvite(){
 const params=useLocalSearchParams<{invitationId?:string|string[]}>();
 const invitationId=Array.isArray(params.invitationId)?params.invitationId[0]:params.invitationId;
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [loading,setLoading]=useState(true);const [signedIn,setSignedIn]=useState(false);const [invite,setInvite]=useState<BusinessInvitation|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   if(!invitationId)throw new Error('This invitation link is incomplete.');
   const {data:{user},error:userError}=await supabase.auth.getUser();
   if(userError||!user){setSignedIn(false);setInvite(null);return;}
   setSignedIn(true);
   const invites=await getMyBusinessInvitations();
   const match=invites.find(item=>item.id===invitationId)??null;
   setInvite(match);
   if(!match)setError('This invitation is not available for the email currently signed in. Use the email address that received the invitation.');
  }catch(e){setError(e instanceof Error?e.message:'This invitation could not be loaded.')}
  finally{setLoading(false)}
 },[invitationId]);

 useEffect(()=>{void load()},[load]);

 async function signIn(){
  if(!invitationId)return;
  if(signedIn)await supabase.auth.signOut();
  const returnTo='/business-invite?invitationId='+encodeURIComponent(invitationId);
  if(Platform.OS==='web'&&typeof window!=='undefined')window.localStorage.setItem('everest-auth-return-to',returnTo);
  else await storePendingQuickActionRoute(returnTo);
  router.replace({pathname:'/auth',params:{intent:'BUSINESS'}} as never);
 }
 async function accept(){
  if(!invite||busy)return;setBusy(true);setError('');
  try{
   const businessId=await acceptBusinessInvitation(invite.id);
   await setWorkspacePreference('BUSINESS',businessId);
   const ctx=await getWorkspaceContext();
   const selected=ctx.businesses.find(item=>item.id===businessId);
   router.replace(selected?businessHomeRoute(selected):'/business-my-work');
  }catch(e){setError(e instanceof Error?e.message:'The invitation could not be accepted.')}
  finally{setBusy(false)}
 }

 return <SafeAreaView style={s.safe}><View style={s.page}>
  <View style={s.brand}><Text style={s.brandText}>EVEREST LOCAL</Text></View>
  <View style={s.card}>
   <View style={s.icon}><Ionicons name="person-add-outline" size={27} color={colors.brand}/></View>
   <Text style={s.eyebrow}>BUSINESS INVITATION</Text>
   <Text style={s.title}>{invite?.business_name?'Join '+invite.business_name:'Join your team on Everest'}</Text>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:24}}/>:<>
    {invite?<><Text style={s.copy}>Your access is ready. Everest will attach this role to your existing personal account, not create a second business identity.</Text>
      <View style={s.roleBox}><Text style={s.roleLabel}>ROLE</Text><Text style={s.role}>{String(invite.member_role).replaceAll('_',' ')}</Text>{invite.job_title?<Text style={s.meta}>{invite.job_title}</Text>:null}<Text style={s.meta}>Expires {new Date(invite.expires_at).toLocaleDateString()}</Text></View>
      <Pressable disabled={busy} onPress={()=>void accept()} style={[s.primary,busy&&s.disabled]}>{busy?<ActivityIndicator color={colors.onBrand}/>:<Text style={s.primaryText}>ACCEPT & OPEN WORKSPACE</Text>}</Pressable>
    </>:!signedIn?<><Text style={s.copy}>Sign in or create your Everest Local account using the same email address that received this invitation.</Text><Pressable onPress={()=>void signIn()} style={s.primary}><Text style={s.primaryText}>SIGN IN TO ACCEPT</Text></Pressable></>:null}
    {error?<View style={s.error}><Ionicons name="alert-circle-outline" size={17} color={colors.danger}/><Text style={s.errorText}>{error}</Text></View>:null}
    {signedIn&&!invite?<Pressable onPress={()=>void signIn()} style={s.secondary}><Text style={s.secondaryText}>SIGN IN WITH A DIFFERENT EMAIL</Text></Pressable>:null}
   </>}
  </View>
 </View></SafeAreaView>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.background},page:{flex:1,paddingHorizontal:22,paddingTop:28,justifyContent:'center',paddingBottom:40},
 brand:{position:'absolute',top:24,left:22},brandText:{fontSize:11,fontWeight:'900',letterSpacing:2,color:c.accent},
 card:{width:'100%',maxWidth:520,alignSelf:'center',borderRadius:26,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:24},
 icon:{width:52,height:52,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',marginBottom:22},
 eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.6,color:c.accent},title:{fontSize:30,lineHeight:35,fontWeight:'900',color:c.text,marginTop:8},
 copy:{fontSize:14,lineHeight:21,color:c.muted,marginTop:12},roleBox:{marginTop:22,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:17},
 roleLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:c.muted},role:{fontSize:16,fontWeight:'900',color:c.text,marginTop:7,textTransform:'capitalize'},
 meta:{fontSize:11,lineHeight:17,color:c.muted,marginTop:5},primary:{minHeight:54,borderRadius:15,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:22,paddingHorizontal:16},
 primaryText:{fontSize:10,fontWeight:'900',letterSpacing:1,color:c.onBrand},disabled:{opacity:.55},secondary:{minHeight:48,alignItems:'center',justifyContent:'center',marginTop:8},
 secondaryText:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:c.text},error:{marginTop:15,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:12,flexDirection:'row',gap:9,alignItems:'center'},
 errorText:{flex:1,fontSize:11,lineHeight:17,color:c.danger},
});
