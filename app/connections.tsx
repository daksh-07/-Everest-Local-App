import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {listConnectionRequests,listConnections,respondConnectionRequest,type ConnectionPerson,type ConnectionRequest} from '@/lib/connections';
import {useAppTheme} from '@/lib/theme';

export default function Connections(){
 const {colors:c}=useAppTheme(); const {userId}=useLocalSearchParams<{userId?:string}>(); const target=typeof userId==='string'?userId:undefined;
 const [tab,setTab]=useState<'CONNECTIONS'|'REQUESTS'>('CONNECTIONS'); const [items,setItems]=useState<ConnectionPerson[]>([]); const [requests,setRequests]=useState<ConnectionRequest[]>([]); const [q,setQ]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 async function load(){setLoading(true);setError('');try{const [a,b]=await Promise.all([listConnections(target),target?Promise.resolve([]):listConnectionRequests()]);setItems(a);setRequests(b)}catch(e){setError(e instanceof Error?e.message:'Connections could not be loaded.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[target]);
 const visible=useMemo(()=>items.filter(x=>(x.display_name??'').toLowerCase().includes(q.trim().toLowerCase())),[items,q]);
 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}><ScrollView contentContainerStyle={{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:14}}><Pressable onPress={()=>router.back()}><Ionicons name="arrow-back" size={23} color={c.text}/></Pressable><Text style={{fontSize:24,fontWeight:'900',color:c.text}}>Connections</Text></View>
  {!target?<View style={{flexDirection:'row',gap:8,marginTop:20}}>{(['CONNECTIONS','REQUESTS'] as const).map(x=><Pressable key={x} onPress={()=>setTab(x)} style={{paddingHorizontal:14,paddingVertical:9,borderRadius:12,backgroundColor:tab===x?c.brand:c.surface,borderWidth:1,borderColor:tab===x?c.brand:c.border}}><Text style={{fontSize:10,fontWeight:'900',color:tab===x?c.onBrand:c.text}}>{x}</Text></Pressable>)}</View>:null}
  {tab==='CONNECTIONS'?<TextInput value={q} onChangeText={setQ} placeholder="Search connections" placeholderTextColor={c.muted} style={{marginTop:16,minHeight:48,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.input,color:c.text,paddingHorizontal:14,fontSize:16}}/>:null}
  {loading?<ActivityIndicator style={{marginTop:50}} color={c.text}/>:tab==='REQUESTS'&&!target?requests.map(r=><View key={r.id} style={{flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:10}}>
    {r.avatar_url?<Image source={{uri:r.avatar_url}} style={{width:46,height:46,borderRadius:23}}/>:<View style={{width:46,height:46,borderRadius:23,backgroundColor:c.soft}}/>}
    <Pressable onPress={()=>router.push('/public-user?id='+r.requester_id)} style={{flex:1}}><Text style={{fontSize:14,fontWeight:'800',color:c.text}}>{r.display_name??'Everest member'}</Text><Text style={{fontSize:10,color:c.muted,marginTop:3}}>{r.mutual_count} mutual connections</Text></Pressable>
    <Pressable onPress={async()=>{await respondConnectionRequest(r.id,true);await load()}} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:10,backgroundColor:c.brand}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>ACCEPT</Text></Pressable>
    <Pressable onPress={async()=>{await respondConnectionRequest(r.id,false);await load()}}><Text style={{fontSize:9,fontWeight:'900',color:c.muted}}>DECLINE</Text></Pressable>
  </View>):visible.map(item=><Pressable key={item.id} onPress={()=>router.push('/public-user?id='+item.id)} style={{flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:10}}>
    {item.avatar_url?<Image source={{uri:item.avatar_url}} style={{width:46,height:46,borderRadius:23}}/>:<View style={{width:46,height:46,borderRadius:23,backgroundColor:c.soft}}/>}
    <View style={{flex:1}}><Text style={{fontSize:14,fontWeight:'800',color:c.text}}>{item.display_name??'Everest member'}</Text>{item.bio?<Text numberOfLines={1} style={{fontSize:11,color:c.muted,marginTop:3}}>{item.bio}</Text>:null}</View>
    <Text style={{fontSize:9,color:c.muted}}>{item.mutual_count?item.mutual_count+' mutual':''}</Text>
  </Pressable>)}
  {error?<Text style={{fontSize:12,color:c.danger,marginTop:14}}>{error}</Text>:null}
 </ScrollView></SafeAreaView>
}