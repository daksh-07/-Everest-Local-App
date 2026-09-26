import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Linking,Pressable,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {beginIntegrationOAuth,listIntegrationConnections,type IntegrationConnection,type IntegrationProvider} from '@/lib/integrations';
import {getBusinessSubscription,hasEverestPro} from '@/lib/billing';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type CatalogItem={
 category:'CALENDAR'|'COMMUNICATION'|'AI';
 provider:IntegrationProvider;
 title:string;
 copy:string;
 available:boolean;
 premium?:boolean;
 logo:'google'|'outlook'|'gmail'|'everest';
};

const catalog:CatalogItem[]=[
 {category:'CALENDAR',provider:'GOOGLE_CALENDAR',title:'Google Calendar',copy:'Bring private busy times into Everest and automatically keep confirmed bookings in sync.',available:true,logo:'google'},
 {category:'CALENDAR',provider:'MICROSOFT_CALENDAR',title:'Microsoft Outlook',copy:'Connect Microsoft 365 calendars so your schedule and Everest stay aligned.',available:true,logo:'outlook'},
 {category:'COMMUNICATION',provider:'GMAIL',title:'Gmail',copy:'Link customer conversations to CRM records and work from one business inbox.',available:true,premium:true,logo:'gmail'},
 {category:'AI',provider:'OPENAI',title:'Everest AI',copy:'CRM-aware summaries, smart drafts, follow-up help and business context inside Everest.',available:false,premium:true,logo:'everest'},
];

export default function BusinessIntegrations(){
 const {colors}=useAppTheme();
 const {width}=useWindowDimensions();
 const desktop=width>=1000;
 const st=useMemo(()=>styles(colors,desktop),[colors,desktop]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);
 const [connections,setConnections]=useState<IntegrationConnection[]>([]);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState('');
 const [error,setError]=useState('');
 const [proActive,setProActive]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);
  setError('');
  try{
   const ctx=await getWorkspaceContext();
   if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(x=>x.id===ctx.active_business_id);
   if(!current)throw new Error('Business access unavailable.');
   setBusiness(current);
   const [nextConnections,subscription]=await Promise.all([listIntegrationConnections(current.id),getBusinessSubscription(current.id)]);
   setConnections(nextConnections);
   setProActive(hasEverestPro(subscription));
  }catch(e){
   setError(e instanceof Error?e.message:'Integrations could not be loaded.');
  }finally{
   setLoading(false);
  }
 },[]);

 useEffect(()=>{void load()},[load]);

 async function connect(provider:IntegrationProvider){
  if(!business||provider==='OPENAI')return;
  setWorking(provider);
  setError('');
  try{
   const url=await beginIntegrationOAuth(business.id,provider);
   await Linking.openURL(url);
  }catch(e){
   setError(e instanceof Error?e.message:'Connection could not be started.');
  }finally{
   setWorking('');
  }
 }

 function openPremium(item:CatalogItem){
  router.push({pathname:'/business-upgrade',params:{feature:item.provider,title:item.title}});
 }

 const byProvider=new Map(connections.map(x=>[x.provider,x]));

 return <SafeAreaView style={st.safe} edges={['top']}>
  <View style={{flex:1}}>
   <ScrollView contentContainerStyle={st.page}>
    <View style={st.header}>
     <Pressable onPress={()=>router.back()} style={st.back}><Ionicons name="arrow-back" size={20} color={colors.text}/></Pressable>
     <View style={{flex:1}}>
      <Text style={st.mode}>BUSINESS MODE</Text>
      <Text style={st.name}>{business?.name??'Integrations'}</Text>
     </View>
     <ModeSwitcher compact/>
    </View>

    <View style={st.hero}>
     <View style={st.heroIcon}><Ionicons name="apps" size={20} color={colors.onBrand}/></View>
     <View style={{flex:1}}>
      <Text style={st.title}>Connect your workspace</Text>
      <Text style={st.copy}>Calendars stay free. Premium tools such as Gmail and Everest AI are locked behind Everest Pro.</Text>
     </View>
    </View>

    {loading?<ActivityIndicator color={colors.brand} style={{marginTop:42}}/>:catalog.map((item,index)=>{
     const connection=byProvider.get(item.provider);
     const status=connection?.status??'NOT_CONNECTED';
     const connected=status==='CONNECTED';
     const locked=Boolean(item.premium)&&!proActive;
     return <View key={item.provider}>
      {index===0||catalog[index-1].category!==item.category?<View style={st.categoryRow}><Text style={st.category}>{item.category}</Text>{item.category==='CALENDAR'?<Text style={st.freeLabel}>INCLUDED</Text>:null}</View>:null}
      <View style={[st.card,locked&&st.premiumCard]}>
       <View style={st.cardTop}>
        <BrandLogo kind={item.logo} colors={colors}/>
        <View style={st.cardBody}>
         <View style={st.titleRow}>
          <Text style={st.cardTitle}>{item.title}</Text>
          {item.premium?<View style={st.proBadge}><Ionicons name={locked?'lock-closed':'checkmark'} size={9} color={colors.onBrand}/><Text style={st.proBadgeText}>{locked?'PRO':'PRO ACTIVE'}</Text></View>:null}
          {!locked?<View style={[st.badge,connected?st.connected:status==='NEEDS_ATTENTION'?st.warning:st.neutral]}><View style={[st.statusDot,connected&&{backgroundColor:colors.brand}]}/><Text style={st.badgeText}>{status.replaceAll('_',' ')}</Text></View>:null}
         </View>
         <Text style={st.cardCopy}>{item.copy}</Text>
         {connection?.account_label&&!locked?<Text style={st.account}>{connection.account_label}</Text>:null}
        </View>
       </View>

       {locked?<View style={st.lockStrip}>
        <View style={st.lockInfo}><Ionicons name="diamond-outline" size={15} color={colors.brand}/><Text style={st.lockCopy}>Available with Everest Pro</Text></View>
        <Pressable onPress={()=>openPremium(item)} style={st.upgradeButton}>
         <Text style={st.upgradeText}>UNLOCK</Text><Ionicons name="arrow-forward" size={14} color={colors.onBrand}/>
        </Pressable>
       </View>:item.provider==='OPENAI'?<View style={st.lockStrip}><View style={st.lockInfo}><Ionicons name="sparkles-outline" size={15} color={colors.brand}/><Text style={st.lockCopy}>Everest AI is included with Pro and is being connected next.</Text></View></View>:<Pressable disabled={working===item.provider||!item.available} onPress={()=>connected&&item.provider.includes('CALENDAR')?router.push('/business-calendar-integrations'):void connect(item.provider)} style={st.action}>
        <Text style={st.actionText}>{working===item.provider?'OPENING…':connected?'CONFIGURE':'CONNECT'}</Text>
        <Ionicons name={connected?'settings-outline':'arrow-forward'} size={15} color={colors.text}/>
       </Pressable>}
      </View>
     </View>
    })}

    <View style={st.categoryRow}><Text style={st.category}>AUTOMATION</Text><Text style={st.freeLabel}>INCLUDED</Text></View>
    <Pressable onPress={()=>router.push('/business-automations')} style={st.wideCard}>
     <View style={st.automationIcon}><Ionicons name="git-branch-outline" size={20} color={colors.brand}/></View>
     <View style={{flex:1}}>
      <Text style={st.cardTitle}>Automations & webhooks</Text>
      <Text style={st.cardCopy}>Create trigger → condition → action workflows and connect external tools with signed webhooks.</Text>
     </View>
     <View style={st.chevron}><Ionicons name="chevron-forward" size={18} color={colors.text}/></View>
    </Pressable>

    {error?<View style={st.errorBox}><Ionicons name="alert-circle-outline" size={16} color={colors.danger}/><Text style={st.error}>{error}</Text></View>:null}
   </ScrollView>
   <BusinessTabBar active="/business-control"/>
  </View>
 </SafeAreaView>
}

function BrandLogo({kind,colors}:{kind:CatalogItem['logo'];colors:ThemeColors}){
 if(kind==='google')return <View style={[brandStyles.shell,{backgroundColor:'#FFFFFF'}]}><Ionicons name="logo-google" size={29} color="#4285F4"/><View style={brandStyles.googleDots}><View style={[brandStyles.dot,{backgroundColor:'#EA4335'}]}/><View style={[brandStyles.dot,{backgroundColor:'#FBBC05'}]}/><View style={[brandStyles.dot,{backgroundColor:'#34A853'}]}/></View></View>;
 if(kind==='outlook')return <View style={[brandStyles.shell,{backgroundColor:'#0A64C9'}]}><Ionicons name="logo-microsoft" size={27} color="#FFFFFF"/></View>;
 if(kind==='gmail')return <View style={[brandStyles.shell,{backgroundColor:'#FFFFFF'}]}><Ionicons name="mail" size={29} color="#EA4335"/></View>;
 return <View style={[brandStyles.shell,{backgroundColor:colors.brand}]}><Ionicons name="sparkles" size={25} color={colors.onBrand}/><View style={[brandStyles.aiMini,{backgroundColor:colors.canvas}]}><Text style={[brandStyles.aiLetter,{color:colors.text}]}>E</Text></View></View>;
}

const brandStyles=StyleSheet.create({
 shell:{width:58,height:58,borderRadius:18,alignItems:'center',justifyContent:'center',overflow:'hidden'},
 googleDots:{position:'absolute',right:7,bottom:7,flexDirection:'row',gap:2},
 dot:{width:4,height:4,borderRadius:2},
 aiMini:{position:'absolute',right:5,bottom:5,width:18,height:18,borderRadius:6,alignItems:'center',justifyContent:'center'},
 aiLetter:{fontSize:9,fontWeight:'900'},
});

const styles=(c:ThemeColors,desktop:boolean)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},
 page:{padding:desktop?28:18,paddingBottom:116,maxWidth:desktop?980:760,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:12},
 back:{width:42,height:42,borderWidth:1,borderColor:c.border,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},
 mode:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:c.muted},
 name:{fontSize:14,fontWeight:'900',color:c.text,marginTop:2},
 hero:{marginTop:24,borderRadius:24,padding:desktop?24:19,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'flex-start',gap:14},
 heroIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},
 title:{fontSize:desktop?34:29,fontWeight:'900',letterSpacing:-.8,color:c.text},
 copy:{fontSize:11,lineHeight:18,color:c.muted,marginTop:7,maxWidth:650},
 categoryRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:27,marginBottom:8},
 category:{fontSize:9,fontWeight:'900',letterSpacing:1.35,color:c.muted},
 freeLabel:{fontSize:7,fontWeight:'900',letterSpacing:.7,color:c.brand},
 card:{borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:22,padding:16,marginBottom:11,shadowColor:'#000',shadowOpacity:.12,shadowRadius:16,shadowOffset:{width:0,height:7},elevation:3},
 premiumCard:{borderColor:c.brand},
 cardTop:{flexDirection:'row',alignItems:'center',gap:14},
 cardBody:{flex:1},
 titleRow:{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'},
 cardTitle:{fontSize:16,fontWeight:'900',color:c.text,letterSpacing:-.2},
 cardCopy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:5,maxWidth:650},
 account:{fontSize:9,fontWeight:'800',color:c.brand,marginTop:6},
 badge:{borderRadius:999,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:5},
 connected:{backgroundColor:c.soft},
 warning:{backgroundColor:c.elevated},
 neutral:{backgroundColor:c.canvas},
 statusDot:{width:5,height:5,borderRadius:3,backgroundColor:c.muted},
 badgeText:{fontSize:7,fontWeight:'900',color:c.muted},
 proBadge:{borderRadius:999,paddingHorizontal:8,paddingVertical:5,backgroundColor:c.brand,flexDirection:'row',alignItems:'center',gap:4},
 proBadgeText:{fontSize:7,fontWeight:'900',color:c.onBrand,letterSpacing:.6},
 action:{marginTop:15,height:46,borderWidth:1,borderColor:c.border,borderRadius:14,paddingHorizontal:15,alignItems:'center',justifyContent:'space-between',flexDirection:'row',backgroundColor:c.canvas},
 actionText:{fontSize:9,fontWeight:'900',color:c.text,letterSpacing:.5},
 lockStrip:{marginTop:15,borderTopWidth:1,borderTopColor:c.border,paddingTop:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 lockInfo:{flexDirection:'row',alignItems:'center',gap:8,flex:1},
 lockCopy:{fontSize:10,fontWeight:'800',color:c.text},
 upgradeButton:{height:38,borderRadius:12,backgroundColor:c.brand,paddingHorizontal:14,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},
 upgradeText:{fontSize:8,fontWeight:'900',color:c.onBrand,letterSpacing:.5},
 wideCard:{borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:22,padding:16,flexDirection:'row',alignItems:'center',gap:13,shadowColor:'#000',shadowOpacity:.10,shadowRadius:14,shadowOffset:{width:0,height:6},elevation:2},
 automationIcon:{width:48,height:48,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
 chevron:{width:34,height:34,borderRadius:11,backgroundColor:c.canvas,alignItems:'center',justifyContent:'center'},
 errorBox:{marginTop:16,borderWidth:1,borderColor:c.danger,borderRadius:14,padding:12,flexDirection:'row',gap:8,alignItems:'center'},
 error:{fontSize:10,color:c.danger,flex:1},
});
