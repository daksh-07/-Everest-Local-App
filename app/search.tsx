import {useEffect,useMemo,useRef,useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {universalSearch,type UniversalKind,type UniversalResult} from '@/lib/universal-search';
import {supabase} from '@/lib/supabase';
import {useAppTheme} from '@/lib/theme';
import {saveSearch} from '@/lib/retention';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistory,
  type SearchHistoryEntry,
} from '@/lib/search-history';

type Tab='TOP'|'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT'|'JOB';
type SortMode='RELEVANCE'|'AZ';
type JobResult={id:string;description:string;suburb:string|null;city:string|null;state:string|null;status:string;budget:number|null;preferred_date:string|null};

const tabs:Tab[]=['TOP','PERSON','BUSINESS','SERVICE','POST','VIDEO','PRODUCT','JOB'];
const labels:Record<Tab,string>={
  TOP:'TOP',
  PERSON:'PEOPLE',
  BUSINESS:'BUSINESSES',
  SERVICE:'SERVICES',
  POST:'POSTS',
  VIDEO:'VIDEOS',
  PRODUCT:'PRODUCTS',
  JOB:'JOBS',
};

function historyLabel(tab:string){
  return labels[tab as Tab]??'TOP';
}

function formatHistoryTime(value:string){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const now=new Date();
  const sameDay=date.toDateString()===now.toDateString();
  return sameDay
    ?date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})
    :date.toLocaleDateString(undefined,{day:'numeric',month:'short'});
}

function HistoryRow({
  item,
  editing,
  onOpen,
  onDelete,
  colors:c,
}:{
  item:SearchHistoryEntry;
  editing:boolean;
  onOpen:()=>void;
  onDelete:()=>void;
  colors:ReturnType<typeof useAppTheme>['colors'];
}){
  const [offset,setOffset]=useState(0);
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,gesture)=>Math.abs(gesture.dx)>10&&Math.abs(gesture.dx)>Math.abs(gesture.dy),
    onPanResponderMove:(_,gesture)=>setOffset(Math.min(0,Math.max(-96,gesture.dx))),
    onPanResponderRelease:(_,gesture)=>{
      if(gesture.dx<-72){
        setOffset(-96);
        onDelete();
      }else{
        setOffset(0);
      }
    },
    onPanResponderTerminate:()=>setOffset(0),
  }),[onDelete]);

  return (
    <View style={{marginBottom:8,overflow:'hidden',borderRadius:16}}>
      <View style={{position:'absolute',inset:0,backgroundColor:c.danger,alignItems:'flex-end',justifyContent:'center',paddingRight:18}}>
        <Ionicons name="trash-outline" size={19} color={c.onBrand}/>
      </View>
      <View
        {...pan.panHandlers}
        style={{
          transform:[{translateX:offset}],
          minHeight:62,
          borderRadius:16,
          borderWidth:1,
          borderColor:c.border,
          backgroundColor:c.surface,
          flexDirection:'row',
          alignItems:'center',
          paddingHorizontal:13,
        }}
      >
        <Pressable
          onPress={onOpen}
          style={{flex:1,flexDirection:'row',alignItems:'center',gap:11,minHeight:60}}
        >
          <View style={{width:36,height:36,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
            <Ionicons name="time-outline" size={17} color={c.text}/>
          </View>
          <View style={{flex:1}}>
            <Text numberOfLines={1} style={{fontSize:13,fontWeight:'800',color:c.text}}>{item.query}</Text>
            <Text style={{fontSize:10,color:c.muted,marginTop:3}}>
              {historyLabel(item.tab)} · {formatHistoryTime(item.createdAt)}
            </Text>
          </View>
        </Pressable>
        {editing?(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Delete '+item.query}
            onPress={onDelete}
            hitSlop={8}
            style={{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.soft}}
          >
            <Ionicons name="trash-outline" size={17} color={c.danger}/>
          </Pressable>
        ):(
          <Ionicons name="arrow-back-outline" size={17} color={c.muted} style={{transform:[{rotate:'90deg'}]}}/>
        )}
      </View>
    </View>
  );
}

export default function Search(){
  const {colors:c}=useAppTheme();
  const params=useLocalSearchParams<{q?:string;tab?:string}>();
  const [q,setQ]=useState(typeof params.q==='string'?params.q:'');
  const [tab,setTab]=useState<Tab>(tabs.includes(params.tab as Tab)?params.tab as Tab:'TOP');
  const [items,setItems]=useState<UniversalResult[]>([]);
  const [jobs,setJobs]=useState<JobResult[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [savingSearch,setSavingSearch]=useState(false);
  const [history,setHistory]=useState<SearchHistoryEntry[]>([]);
  const [menuOpen,setMenuOpen]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [manageHistory,setManageHistory]=useState(false);
  const [photoOnly,setPhotoOnly]=useState(false);
  const [sortMode,setSortMode]=useState<SortMode>('RELEVANCE');
  const version=useRef(0);

  useEffect(()=>{void getSearchHistory().then(setHistory)},[]);

  useEffect(()=>{
    const timer=setTimeout(()=>{
      const current=++version.current;
      const text=q.trim();
      setError('');
      setItems([]);
      setJobs([]);
      if(!text){
        setLoading(false);
        return;
      }
      setLoading(true);
      if(tab==='JOB')void loadJobs(text,current);
      else void universalSearch(text,tab as UniversalKind,30,0)
        .then(x=>{if(version.current===current)setItems(x)})
        .catch(e=>{if(version.current===current)setError(e instanceof Error?e.message:'Search is unavailable.')})
        .finally(()=>{if(version.current===current)setLoading(false)});
    },350);
    return()=>clearTimeout(timer);
  },[q,tab]);

  async function rememberSearch(text=q.trim(),kind=tab){
    if(!text)return;
    try{
      const next=await addSearchHistory(text,kind);
      setHistory(next);
    }catch{
      // Search must remain usable even if local history cannot be written.
    }
  }

  async function loadJobs(query:string,current:number){
    try{
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError)throw userError;
      if(!user){
        if(version.current===current)setJobs([]);
        return;
      }
      const {data:profile,error:profileError}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
      if(profileError)throw profileError;
      const pattern=query.trim()?('%'+query.trim()+'%'):null;
      if(profile?.role==='BUSINESS'||profile?.role==='ADMIN'){
        let request=supabase.from('opportunities')
          .select('id,status,service_requests!inner(id,description,suburb,city,state,budget,preferred_date)')
          .eq('status','OPEN')
          .order('created_at',{ascending:false})
          .limit(50);
        if(pattern)request=request.ilike('service_requests.description',pattern);
        const {data,error:requestError}=await request;
        if(requestError)throw requestError;
        const mapped=(data??[]).map(item=>{
          const raw=Array.isArray(item.service_requests)?item.service_requests[0]:item.service_requests;
          return raw?{...raw,status:item.status}:null;
        }).filter((item):item is JobResult=>item!==null);
        if(version.current===current)setJobs(mapped);
      }else{
        let request=supabase.from('service_requests')
          .select('id,description,suburb,city,state,status,budget,preferred_date')
          .eq('customer_id',user.id)
          .order('created_at',{ascending:false})
          .limit(50);
        if(pattern)request=request.ilike('description',pattern);
        const {data,error:requestError}=await request;
        if(requestError)throw requestError;
        if(version.current===current)setJobs((data??[]) as JobResult[]);
      }
    }catch(e){
      if(version.current===current)setError(e instanceof Error?e.message:'Jobs could not be loaded.');
    }finally{
      if(version.current===current)setLoading(false);
    }
  }

  function open(x:UniversalResult){
    void rememberSearch();
    if(x.kind==='PERSON')router.push('/public-user?id='+x.id);
    else if(x.kind==='BUSINESS')router.push('/business-profile?id='+x.id);
    else if(x.kind==='SERVICE'){
      const business=typeof x.metadata.business_id==='string'?x.metadata.business_id:'';
      router.push(business?'/business-profile?id='+business:'/services');
    }else if(x.kind==='PRODUCT')router.push('/product?id='+x.id);
    else{
      const business=typeof x.metadata.business_id==='string'?x.metadata.business_id:'';
      const author=typeof x.metadata.author_id==='string'?x.metadata.author_id:'';
      router.push(business?'/business-profile?id='+business:author?'/public-user?id='+author:'/social');
    }
  }

  async function saveCurrentSearch(){
    const text=q.trim();
    if(!text||savingSearch)return;
    setSavingSearch(true);
    setError('');
    try{
      await rememberSearch(text,tab);
      await saveSearch({
        name:text.slice(0,120),
        query:text,
        vertical:tab==='BUSINESS'?'BUSINESS':tab==='SERVICE'?'SERVICE':tab==='PRODUCT'?'PRODUCT':'ALL',
      });
      router.push('/saved-searches');
    }catch(e){
      setError(e instanceof Error?e.message:'Could not save this search.');
    }finally{
      setSavingSearch(false);
    }
  }

  async function removeHistoryItem(id:string){
    try{
      const next=await removeSearchHistory(id);
      setHistory(next);
    }catch{
      setError('Could not update recent searches.');
    }
  }

  function deleteAllHistory(){
    setMenuOpen(false);
    if(!history.length)return;
    Alert.alert(
      'Clear recent searches?',
      'This removes all search history stored on this device.',
      [
        {text:'Cancel',style:'cancel'},
        {
          text:'Clear all',
          style:'destructive',
          onPress:async()=>{
            try{
              const next=await clearSearchHistory();
              setHistory(next);
              setManageHistory(false);
            }catch{
              setError('Could not clear recent searches.');
            }
          },
        },
      ],
    );
  }

  function openHistoryEntry(item:SearchHistoryEntry){
    const nextTab=tabs.includes(item.tab as Tab)?item.tab as Tab:'TOP';
    setTab(nextTab);
    setQ(item.query);
    void rememberSearch(item.query,nextTab);
  }

  const filteredItems=useMemo(()=>{
    let next=[...items];
    if(photoOnly){
      next=next.filter(item=>typeof item.metadata.avatar_url==='string'||typeof item.metadata.logo_url==='string');
    }
    if(sortMode==='AZ'){
      next.sort((a,b)=>a.title.localeCompare(b.title));
    }else{
      next.sort((a,b)=>Number(b.score??0)-Number(a.score??0));
    }
    return next;
  },[items,photoOnly,sortMode]);

  const icon=(k:UniversalResult['kind'])=>k==='PERSON'?'person-outline':k==='BUSINESS'?'business-outline':k==='SERVICE'?'construct-outline':k==='PRODUCT'?'cube-outline':k==='VIDEO'?'videocam-outline':'document-text-outline';

  return (
    <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{padding:20,paddingBottom:70,maxWidth:900,width:'100%',alignSelf:'center'}}
      >
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
          <View>
            <Text style={{fontSize:10,fontWeight:'900',letterSpacing:2,color:c.muted}}>EVEREST LOCAL</Text>
            <Text style={{fontSize:30,fontWeight:'900',color:c.text,marginTop:4}}>Search</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search options"
            onPress={()=>setMenuOpen(true)}
            style={({pressed})=>({
              width:44,height:44,borderRadius:14,borderWidth:1,borderColor:c.border,
              backgroundColor:pressed?c.soft:c.surface,alignItems:'center',justifyContent:'center',
            })}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={c.text}/>
          </Pressable>
        </View>

        <View style={{marginTop:18,minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:9}}>
          <Ionicons name="search" size={20} color={c.muted}/>
          <TextInput
            accessibilityLabel="Search Everest Local"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={()=>void rememberSearch()}
            placeholder="Search people, businesses, services, posts or jobs…"
            placeholderTextColor={c.muted}
            style={[
              {flex:1,fontSize:16,color:c.text,minHeight:48},
              {outlineStyle:'none'} as never,
            ]}
            returnKeyType="search"
          />
          {q.length?(
            <Pressable onPress={()=>setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={19} color={c.muted}/>
            </Pressable>
          ):null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingVertical:14}}>
          {tabs.map(x=>(
            <Pressable
              key={x}
              onPress={()=>setTab(x)}
              style={{
                paddingHorizontal:13,paddingVertical:9,borderRadius:12,borderWidth:1,
                borderColor:tab===x?c.brand:c.border,
                backgroundColor:tab===x?c.brand:c.surface,
              }}
            >
              <Text style={{fontSize:9,fontWeight:'900',color:tab===x?c.onBrand:c.text}}>{labels[x]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {q.trim()?(
          <View style={{flexDirection:'row',gap:8,marginBottom:5}}>
            <Pressable
              onPress={()=>setFiltersOpen(true)}
              style={{height:42,paddingHorizontal:14,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7}}
            >
              <Ionicons name="options-outline" size={16} color={c.text}/>
              <Text style={{fontSize:9,fontWeight:'900',color:c.text}}>FILTER</Text>
              {photoOnly||sortMode!=='RELEVANCE'?<View style={{width:6,height:6,borderRadius:3,backgroundColor:c.brand}}/>:null}
            </Pressable>
            <Pressable
              disabled={savingSearch}
              onPress={()=>void saveCurrentSearch()}
              style={{flex:1,height:42,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7}}
            >
              <Ionicons name="bookmark-outline" size={16} color={c.text}/>
              <Text style={{fontSize:9,fontWeight:'900',color:c.text}}>{savingSearch?'SAVING…':'SAVE THIS SEARCH'}</Text>
            </Pressable>
          </View>
        ):null}

        {!q.trim()?(
          <View>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:12,marginBottom:10}}>
              <View>
                <Text style={{fontSize:17,fontWeight:'900',color:c.text}}>Recent searches</Text>
                <Text style={{fontSize:11,color:c.muted,marginTop:2}}>Up to 15 searches · swipe left to remove</Text>
              </View>
              {history.length?(
                <Pressable onPress={()=>setManageHistory(value=>!value)} hitSlop={8}>
                  <Text style={{fontSize:11,fontWeight:'800',color:c.text}}>{manageHistory?'Done':'Manage'}</Text>
                </Pressable>
              ):null}
            </View>

            {history.length?history.map(item=>(
              <HistoryRow
                key={item.id}
                item={item}
                editing={manageHistory}
                onOpen={()=>openHistoryEntry(item)}
                onDelete={()=>void removeHistoryItem(item.id)}
                colors={c}
              />
            )):(
              <View style={{paddingVertical:44,alignItems:'center'}}>
                <View style={{width:58,height:58,borderRadius:20,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                  <Ionicons name="search-outline" size={27} color={c.muted}/>
                </View>
                <Text style={{fontSize:16,fontWeight:'900',color:c.text,marginTop:13}}>Search Everest Local</Text>
                <Text style={{fontSize:12,lineHeight:18,color:c.muted,marginTop:7,textAlign:'center',maxWidth:420}}>
                  Your recent searches will appear here, so you can jump back in instantly.
                </Text>
              </View>
            )}
          </View>
        ):loading?(
          <ActivityIndicator style={{marginTop:40}} color={c.text}/>
        ):error?(
          <Text style={{fontSize:12,color:c.danger,marginTop:20}}>{error}</Text>
        ):tab==='JOB'?(
          jobs.length?jobs.map(job=>(
            <Pressable
              key={job.id}
              onPress={()=>{void rememberSearch();router.push('/requests')}}
              style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginBottom:9}}
            >
              <View style={{width:44,height:44,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="briefcase-outline" size={20} color={c.text}/>
              </View>
              <View style={{flex:1}}>
                <Text numberOfLines={2} style={{fontSize:14,fontWeight:'900',color:c.text}}>{job.description}</Text>
                <Text style={{fontSize:11,lineHeight:16,color:c.muted,marginTop:3}}>
                  {[job.suburb,job.city,job.state].filter(Boolean).join(', ')||'Local job'}
                  {job.budget!=null?' · Budget $'+Number(job.budget).toFixed(0):''}
                </Text>
                <Text style={{fontSize:9,fontWeight:'900',color:c.brand,marginTop:5}}>JOB</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted}/>
            </Pressable>
          )):(
            <View style={{paddingVertical:38,alignItems:'center'}}>
              <Text style={{fontSize:16,fontWeight:'900',color:c.text}}>No jobs found</Text>
              <Text style={{fontSize:12,color:c.muted,marginTop:6,textAlign:'center'}}>No jobs match this search for your account.</Text>
            </View>
          )
        ):filteredItems.length?(
          filteredItems.map(x=>(
            <Pressable
              key={x.kind+':'+x.id}
              onPress={()=>open(x)}
              style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginBottom:9}}
            >
              {typeof x.metadata.avatar_url==='string'||typeof x.metadata.logo_url==='string'?(
                <Image source={{uri:String(x.metadata.avatar_url??x.metadata.logo_url)}} style={{width:44,height:44,borderRadius:14}}/>
              ):(
                <View style={{width:44,height:44,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                  <Ionicons name={icon(x.kind)} size={20} color={c.text}/>
                </View>
              )}
              <View style={{flex:1}}>
                <Text style={{fontSize:14,fontWeight:'900',color:c.text}}>{x.title}</Text>
                <Text numberOfLines={2} style={{fontSize:11,lineHeight:16,color:c.muted,marginTop:3}}>{x.subtitle}</Text>
                <Text style={{fontSize:9,fontWeight:'900',color:c.brand,marginTop:5}}>{x.kind==='PERSON'?'PERSON':x.kind}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted}/>
            </Pressable>
          ))
        ):(
          <View style={{paddingVertical:38,alignItems:'center'}}>
            <Text style={{fontSize:16,fontWeight:'900',color:c.text}}>No Everest results</Text>
            <Text style={{fontSize:12,color:c.muted,marginTop:6,textAlign:'center'}}>
              {photoOnly?'No results match the active filters.':'Try another keyword or search businesses outside Everest below.'}
            </Text>
          </View>
        )}

        {(tab==='TOP'||tab==='BUSINESS'||tab==='SERVICE')&&q.trim()?(
          <Pressable
            onPress={()=>{void rememberSearch();router.push('/external-businesses?q='+encodeURIComponent(q.trim()))}}
            style={{marginTop:20,padding:18,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:12}}
          >
            <View style={{width:42,height:42,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
              <Ionicons name="globe-outline" size={20} color={c.text}/>
            </View>
            <View style={{flex:1}}>
              <Text style={{fontSize:13,fontWeight:'900',color:c.text}}>Can’t find what you’re looking for?</Text>
              <Text style={{fontSize:11,color:c.muted,marginTop:3}}>Search businesses outside Everest</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted}/>
          </Pressable>
        ):null}
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={()=>setMenuOpen(false)}>
        <Pressable onPress={()=>setMenuOpen(false)} style={{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'flex-end'}}>
          <Pressable
            onPress={()=>{}}
            style={{width:'100%',maxWidth:900,alignSelf:'center',borderTopLeftRadius:28,borderTopRightRadius:28,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,paddingHorizontal:18,paddingTop:10,paddingBottom:28}}
          >
            <View style={{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:16}}/>
            <Text style={{fontSize:17,fontWeight:'900',color:c.text}}>Search options</Text>
            <Text style={{fontSize:12,color:c.muted,marginTop:3,marginBottom:14}}>Control history, filters and connections</Text>

            {[
              {icon:'options-outline' as const,title:'Filter & sort',subtitle:'Result type, media and sorting',action:()=>{setMenuOpen(false);setFiltersOpen(true)}},
              {icon:'time-outline' as const,title:'Manage history',subtitle:'Review or remove individual searches',action:()=>{setMenuOpen(false);setManageHistory(true);setQ('')}},
              {icon:'people-outline' as const,title:'Connections',subtitle:'View your Everest connections',action:()=>{setMenuOpen(false);router.push('/connections')}},
            ].map(item=>(
              <Pressable
                key={item.title}
                onPress={item.action}
                style={({pressed})=>({minHeight:58,borderRadius:16,paddingHorizontal:14,flexDirection:'row',alignItems:'center',backgroundColor:pressed?c.soft:c.input,marginBottom:8})}
              >
                <View style={{width:36,height:36,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                  <Ionicons name={item.icon} size={18} color={c.text}/>
                </View>
                <View style={{flex:1,marginLeft:11}}>
                  <Text style={{fontSize:13,fontWeight:'800',color:c.text}}>{item.title}</Text>
                  <Text style={{fontSize:10,color:c.muted,marginTop:2}}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={c.muted}/>
              </Pressable>
            ))}

            <Pressable
              disabled={!history.length}
              onPress={deleteAllHistory}
              style={({pressed})=>({minHeight:58,borderRadius:16,paddingHorizontal:14,flexDirection:'row',alignItems:'center',backgroundColor:pressed?c.soft:c.input,opacity:history.length?1:0.45})}
            >
              <View style={{width:36,height:36,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="trash-outline" size={18} color={c.danger}/>
              </View>
              <View style={{flex:1,marginLeft:11}}>
                <Text style={{fontSize:13,fontWeight:'800',color:c.danger}}>Delete all history</Text>
                <Text style={{fontSize:10,color:c.muted,marginTop:2}}>Clear all recent searches on this device</Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={()=>setFiltersOpen(false)}>
        <Pressable onPress={()=>setFiltersOpen(false)} style={{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'flex-end'}}>
          <Pressable
            onPress={()=>{}}
            style={{width:'100%',maxWidth:900,alignSelf:'center',borderTopLeftRadius:28,borderTopRightRadius:28,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,paddingHorizontal:18,paddingTop:10,paddingBottom:28}}
          >
            <View style={{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:16}}/>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <View>
                <Text style={{fontSize:19,fontWeight:'900',color:c.text}}>Filter search</Text>
                <Text style={{fontSize:11,color:c.muted,marginTop:3}}>Narrow results without losing your query</Text>
              </View>
              <Pressable onPress={()=>{setPhotoOnly(false);setSortMode('RELEVANCE');setTab('TOP')}}>
                <Text style={{fontSize:11,fontWeight:'800',color:c.text}}>Reset</Text>
              </Pressable>
            </View>

            <Text style={{fontSize:12,fontWeight:'900',color:c.text,marginTop:22,marginBottom:9}}>SEARCH IN</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {tabs.map(x=>(
                <Pressable
                  key={x}
                  onPress={()=>setTab(x)}
                  style={{paddingHorizontal:12,paddingVertical:9,borderRadius:12,borderWidth:1,borderColor:tab===x?c.brand:c.border,backgroundColor:tab===x?c.brand:c.input}}
                >
                  <Text style={{fontSize:10,fontWeight:'900',color:tab===x?c.onBrand:c.text}}>{labels[x]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{fontSize:12,fontWeight:'900',color:c.text,marginTop:22,marginBottom:9}}>RESULT QUALITY</Text>
            <Pressable
              disabled={tab==='JOB'}
              onPress={()=>setPhotoOnly(value=>!value)}
              style={{minHeight:54,borderRadius:16,backgroundColor:c.input,borderWidth:1,borderColor:c.border,paddingHorizontal:14,flexDirection:'row',alignItems:'center',opacity:tab==='JOB'?0.45:1}}
            >
              <View style={{width:34,height:34,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="image-outline" size={17} color={c.text}/>
              </View>
              <View style={{flex:1,marginLeft:11}}>
                <Text style={{fontSize:13,fontWeight:'800',color:c.text}}>Only results with a photo or logo</Text>
                <Text style={{fontSize:10,color:c.muted,marginTop:2}}>Useful for quickly finding established profiles</Text>
              </View>
              <Ionicons name={photoOnly?'checkmark-circle':'ellipse-outline'} size={22} color={photoOnly?c.brand:c.muted}/>
            </Pressable>

            <Text style={{fontSize:12,fontWeight:'900',color:c.text,marginTop:22,marginBottom:9}}>SORT</Text>
            <View style={{flexDirection:'row',gap:8}}>
              {([
                ['RELEVANCE','Most relevant'],
                ['AZ','A–Z'],
              ] as [SortMode,string][]).map(([value,label])=>(
                <Pressable
                  key={value}
                  disabled={tab==='JOB'}
                  onPress={()=>setSortMode(value)}
                  style={{flex:1,minHeight:48,borderRadius:14,borderWidth:1,borderColor:sortMode===value?c.brand:c.border,backgroundColor:sortMode===value?c.soft:c.input,alignItems:'center',justifyContent:'center',opacity:tab==='JOB'?0.45:1}}
                >
                  <Text style={{fontSize:11,fontWeight:'800',color:c.text}}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={()=>setFiltersOpen(false)}
              style={{height:50,borderRadius:16,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:24}}
            >
              <Text style={{fontSize:13,fontWeight:'900',color:c.onBrand}}>Show results</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
