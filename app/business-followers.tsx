import {useEffect,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {listBusinessFollowers,type BusinessFollower} from '@/lib/social';
import {useAppTheme} from '@/lib/theme';

const PAGE_SIZE=25;

export default function BusinessFollowers(){
 const {colors:c}=useAppTheme();
 const {businessId,name}=useLocalSearchParams<{businessId?:string;name?:string}>();
 const id=typeof businessId==='string'?businessId:'';
 const title=typeof name==='string'&&name?name:'Business';
 const [items,setItems]=useState<BusinessFollower[]>([]);
 const [loading,setLoading]=useState(true);
 const [more,setMore]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 async function load(reset=false){
  if(!id)return;
  if(reset)setLoading(true);else setBusy(true);
  setError('');
  try{
   const offset=reset?0:items.length;
   const rows=await listBusinessFollowers(id,PAGE_SIZE,offset);
   setItems(current=>reset?rows:[...current,...rows]);
   setMore(rows.length===PAGE_SIZE);
  }catch(e){setError(e instanceof Error?e.message:'Followers could not be loaded.')}
  finally{setLoading(false);setBusy(false)}
 }

 useEffect(()=>{void load(true)},[id]);

 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <ScrollView contentContainerStyle={{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:14}}>
    <Pressable onPress={()=>router.back()}><Ionicons name="arrow-back" size={23} color={c.text}/></Pressable>
    <View style={{flex:1}}><Text style={{fontSize:23,fontWeight:'900',color:c.text}}>Followers</Text><Text style={{fontSize:11,color:c.muted,marginTop:3}}>{title}</Text></View>
   </View>
   {loading?<ActivityIndicator style={{marginTop:60}} color={c.text}/>:items.length?items.map(item=><Pressable key={item.id} onPress={()=>router.push('/public-user?id='+item.id)} style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:10}}>
    {item.avatar_url?<Image source={{uri:item.avatar_url}} style={{width:48,height:48,borderRadius:24}}/>:<View style={{width:48,height:48,borderRadius:24,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:17,fontWeight:'900',color:c.text}}>{(item.display_name??'E')[0]?.toUpperCase()}</Text></View>}
    <View style={{flex:1}}><Text style={{fontSize:14,fontWeight:'900',color:c.text}}>{item.display_name??'Everest member'}</Text>{item.username?<Text style={{fontSize:10,color:c.muted,marginTop:2}}>@{item.username}</Text>:null}{item.bio?<Text numberOfLines={1} style={{fontSize:11,color:c.textSecondary,marginTop:4}}>{item.bio}</Text>:null}{item.connection_state==='CONNECTED'?<Text style={{fontSize:9,fontWeight:'800',color:c.muted,marginTop:5}}>CONNECTED{item.mutual_count?' · '+item.mutual_count+' mutual':''}</Text>:null}</View>
    <Ionicons name="chevron-forward" size={18} color={c.muted}/>
   </Pressable>):<View style={{paddingVertical:60,alignItems:'center'}}><Text style={{fontSize:16,fontWeight:'900',color:c.text}}>No visible followers</Text><Text style={{fontSize:11,color:c.muted,marginTop:6,textAlign:'center'}}>Private, blocked or unavailable profiles are not shown.</Text></View>}
   {more&&!loading?<Pressable disabled={busy} onPress={()=>void load(false)} style={{marginTop:16,minHeight:44,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',opacity:busy?0.6:1}}><Text style={{fontSize:10,fontWeight:'900',color:c.text}}>{busy?'LOADING…':'LOAD MORE'}</Text></Pressable>:null}
   {error?<Text style={{fontSize:12,color:c.danger,marginTop:14}}>{error}</Text>:null}
  </ScrollView>
 </SafeAreaView>;
}
