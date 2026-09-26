import {useEffect,useMemo,useRef,useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  blockUser,
  cancelConnectionRequest,
  getPublicUserProfile,
  publicPostsForUser,
  removeConnection,
  reportUser,
  sendConnectionRequest,
  sendPersonalMessage,
  type PublicUserProfile,
} from '@/lib/connections';
import {useAppTheme} from '@/lib/theme';

function initialsFor(name:string|null){
  const parts=(name??'').trim().split(/\s+/).filter(Boolean);
  const useful=parts.filter(part=>/[A-Za-z]/.test(part)&&!/^[0-9]/.test(part));
  const source=useful.length?useful:parts;
  if(!source.length)return 'E';
  return source.slice(0,2).map(part=>part[0]?.toUpperCase()).join('');
}

function formatJoined(value:string|null){
  if(!value)return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return date.toLocaleDateString(undefined,{month:'short',year:'numeric'});
}

function postTypeLabel(value:unknown){
  return String(value??'POST').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,char=>char.toUpperCase());
}

export default function PublicUser(){
  const {colors:c}=useAppTheme();
  const {id}=useLocalSearchParams<{id?:string}>();
  const userId=typeof id==='string'?id:'';

  const [p,setP]=useState<PublicUserProfile|null>(null);
  const [posts,setPosts]=useState<Awaited<ReturnType<typeof publicPostsForUser>>>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const messageInputRef=useRef<TextInput|null>(null);

  async function load(){
    if(!userId)return;
    setLoading(true);
    setError('');
    try{
      const [profile,content]=await Promise.all([
        getPublicUserProfile(userId),
        publicPostsForUser(userId),
      ]);
      setP(profile);
      setPosts(content);
    }catch(e){
      setError(e instanceof Error?e.message:'Profile could not be loaded.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load()},[userId]);

  const initials=useMemo(()=>initialsFor(p?.display_name??null),[p?.display_name]);
  const joined=useMemo(()=>formatJoined(p?.joined_at??null),[p?.joined_at]);
  const canConnect=Boolean(
    p&&
    p.connection_state!=='SELF'&&
    p.connection_state!=='UNAVAILABLE'&&
    p.connection_state!=='BLOCKED'
  );
  const canMessage=Boolean(p&&p.connection_state!=='BLOCKED'&&p.connection_state!=='UNAVAILABLE'&&p.connection_state!=='SELF');

  async function connect(){
    if(!p)return;
    setBusy(true);
    setError('');
    try{
      if(p.connection_state==='NONE')await sendConnectionRequest(p.id);
      else if(p.connection_state==='OUTGOING')await cancelConnectionRequest(p.id);
      else if(p.connection_state==='CONNECTED')await removeConnection(p.id);
      else if(p.connection_state==='INCOMING'){
        router.push('/connections');
        return;
      }
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:'Connection action failed.');
    }finally{
      setBusy(false);
    }
  }

  async function send(){
    if(!p||!message.trim())return;
    setBusy(true);
    setError('');
    try{
      const conversationId=await sendPersonalMessage(p.id,message.trim());
      setMessage('');
      router.push('/messages?personalId='+conversationId);
    }catch(e){
      setError(e instanceof Error?e.message:'Message could not be sent.');
    }finally{
      setBusy(false);
    }
  }

  async function confirmReport(){
    if(!p)return;
    setMenuOpen(false);
    Alert.alert(
      'Report profile',
      'Send this profile to Everest Local for review?',
      [
        {text:'Cancel',style:'cancel'},
        {
          text:'Report',
          onPress:async()=>{
            setBusy(true);
            setError('');
            try{
              await reportUser(p.id,'OTHER');
              Alert.alert('Report sent','Thanks. Everest Local will review this profile.');
            }catch(e){
              setError(e instanceof Error?e.message:'Report could not be sent.');
            }finally{
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function confirmBlock(){
    if(!p)return;
    setMenuOpen(false);
    Alert.alert(
      'Block this person?',
      'They will no longer be able to connect with or message you.',
      [
        {text:'Cancel',style:'cancel'},
        {
          text:'Block',
          style:'destructive',
          onPress:async()=>{
            setBusy(true);
            setError('');
            try{
              await blockUser(p.id);
              router.back();
            }catch(e){
              setError(e instanceof Error?e.message:'User could not be blocked.');
            }finally{
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if(loading){
    return (
      <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
        <ActivityIndicator style={{marginTop:80}} color={c.text}/>
      </SafeAreaView>
    );
  }

  const connectionLabel=p?.connection_state==='CONNECTED'
    ?'Connected'
    :p?.connection_state==='OUTGOING'
      ?'Requested'
      :p?.connection_state==='INCOMING'
        ?'View request'
        :'Connect';

  return (
    <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom:72}}
      >
        <View style={{maxWidth:760,width:'100%',alignSelf:'center'}}>
          <View style={{paddingHorizontal:20,paddingTop:4}}>
            <View style={{height:50,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={12}
                onPress={()=>router.back()}
                style={({pressed})=>({
                  width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',
                  backgroundColor:pressed?c.soft:'transparent',
                })}
              >
                <Ionicons name="chevron-back" size={25} color={c.text}/>
              </Pressable>

              <Text style={{fontSize:16,fontWeight:'800',color:c.text}}>Profile</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Profile actions"
                hitSlop={12}
                disabled={!p||busy}
                onPress={()=>setMenuOpen(true)}
                style={({pressed})=>({
                  width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',
                  backgroundColor:pressed?c.soft:'transparent',
                  opacity:!p||busy?0.45:1,
                })}
              >
                <Ionicons name="ellipsis-horizontal" size={24} color={c.text}/>
              </Pressable>
            </View>
          </View>

          {!p?(
            <View style={{paddingHorizontal:24,paddingVertical:90,alignItems:'center'}}>
              <View style={{width:72,height:72,borderRadius:36,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="person-outline" size={30} color={c.muted}/>
              </View>
              <Text style={{fontSize:20,fontWeight:'900',color:c.text,marginTop:18}}>Profile unavailable</Text>
              <Text style={{fontSize:13,lineHeight:20,color:c.muted,marginTop:8,textAlign:'center',maxWidth:320}}>
                This profile may be private, blocked, or unavailable to you.
              </Text>
            </View>
          ):(
            <>
              <View style={{paddingHorizontal:20,paddingTop:18}}>
                <View
                  style={{
                    borderRadius:28,
                    backgroundColor:c.surface,
                    borderWidth:1,
                    borderColor:c.border,
                    paddingHorizontal:20,
                    paddingTop:24,
                    paddingBottom:20,
                  }}
                >
                  <View style={{alignItems:'center'}}>
                    <View style={{padding:4,borderRadius:58,borderWidth:1,borderColor:c.border,backgroundColor:c.canvas}}>
                      {p.avatar_url?(
                        <Image source={{uri:p.avatar_url}} style={{width:104,height:104,borderRadius:52}}/>
                      ):(
                        <View style={{width:104,height:104,borderRadius:52,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                          <Text style={{fontSize:32,fontWeight:'900',color:c.text}}>{initials}</Text>
                        </View>
                      )}
                    </View>

                    <View style={{flexDirection:'row',alignItems:'center',gap:7,marginTop:16}}>
                      <Text style={{fontSize:26,lineHeight:32,fontWeight:'900',color:c.text,textAlign:'center',maxWidth:560}}>
                        {p.display_name??'Everest member'}
                      </Text>
                    </View>

                    {p.username?(
                      <Text style={{fontSize:14,color:c.muted,marginTop:4}}>@{p.username}</Text>
                    ):null}

                    {p.bio?(
                      <Text style={{fontSize:14,lineHeight:21,color:c.textSecondary,textAlign:'center',marginTop:12,maxWidth:500}}>
                        {p.bio}
                      </Text>
                    ):null}

                    {(p.suburb||joined)?(
                      <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8,marginTop:14}}>
                        {p.suburb?(
                          <View style={{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:c.soft}}>
                            <Ionicons name="location-outline" size={14} color={c.muted}/>
                            <Text style={{fontSize:12,fontWeight:'700',color:c.textSecondary}}>{p.suburb}</Text>
                          </View>
                        ):null}
                        {joined?(
                          <View style={{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:c.soft}}>
                            <Ionicons name="calendar-outline" size={14} color={c.muted}/>
                            <Text style={{fontSize:12,fontWeight:'700',color:c.textSecondary}}>Joined {joined}</Text>
                          </View>
                        ):null}
                      </View>
                    ):null}
                  </View>

                  <Pressable
                    onPress={()=>router.push('/connections?userId='+p.id)}
                    style={({pressed})=>({
                      marginTop:22,
                      borderRadius:18,
                      backgroundColor:pressed?c.soft:c.input,
                      paddingVertical:14,
                      paddingHorizontal:12,
                      flexDirection:'row',
                      alignItems:'center',
                      justifyContent:'space-around',
                    })}
                  >
                    <View style={{alignItems:'center',minWidth:90}}>
                      <Text style={{fontSize:20,fontWeight:'900',color:c.text}}>{p.connection_count}</Text>
                      <Text style={{fontSize:11,fontWeight:'700',color:c.muted,marginTop:2}}>Connections</Text>
                    </View>
                    <View style={{width:1,height:32,backgroundColor:c.border}}/>
                    <View style={{alignItems:'center',minWidth:90}}>
                      <Text style={{fontSize:20,fontWeight:'900',color:c.text}}>{p.mutual_count}</Text>
                      <Text style={{fontSize:11,fontWeight:'700',color:c.muted,marginTop:2}}>Mutual</Text>
                    </View>
                    <View style={{width:1,height:32,backgroundColor:c.border}}/>
                    <View style={{alignItems:'center',minWidth:90}}>
                      <Text style={{fontSize:20,fontWeight:'900',color:c.text}}>{posts.length}</Text>
                      <Text style={{fontSize:11,fontWeight:'700',color:c.muted,marginTop:2}}>Posts</Text>
                    </View>
                  </Pressable>

                  <View style={{flexDirection:'row',gap:10,marginTop:14}}>
                    {canConnect?(
                      <Pressable
                        disabled={busy}
                        onPress={()=>void connect()}
                        style={({pressed})=>({
                          flex:1,
                          minHeight:48,
                          borderRadius:16,
                          backgroundColor:p.connection_state==='CONNECTED'||p.connection_state==='OUTGOING'?c.soft:c.brand,
                          borderWidth:p.connection_state==='CONNECTED'||p.connection_state==='OUTGOING'?1:0,
                          borderColor:c.border,
                          alignItems:'center',
                          justifyContent:'center',
                          opacity:busy?0.55:pressed?0.86:1,
                        })}
                      >
                        <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
                          <Ionicons
                            name={p.connection_state==='CONNECTED'?'checkmark-circle':p.connection_state==='OUTGOING'?'time-outline':p.connection_state==='INCOMING'?'people-outline':'person-add-outline'}
                            size={18}
                            color={p.connection_state==='CONNECTED'||p.connection_state==='OUTGOING'?c.text:c.onBrand}
                          />
                          <Text style={{fontSize:13,fontWeight:'900',color:p.connection_state==='CONNECTED'||p.connection_state==='OUTGOING'?c.text:c.onBrand}}>
                            {connectionLabel}
                          </Text>
                        </View>
                      </Pressable>
                    ):null}

                    {canMessage?(
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Message this user"
                        onPress={()=>messageInputRef.current?.focus()}
                        style={({pressed})=>({
                          width:52,
                          minHeight:48,
                          borderRadius:16,
                          borderWidth:1,
                          borderColor:c.border,
                          backgroundColor:pressed?c.soft:c.input,
                          alignItems:'center',
                          justifyContent:'center',
                        })}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={21} color={c.text}/>
                      </Pressable>
                    ):null}
                  </View>
                </View>
              </View>

              {canMessage?(
                <View style={{paddingHorizontal:20,marginTop:18}}>
                  <View
                    nativeID="quick-message"
                    style={{
                      borderRadius:22,
                      backgroundColor:c.surface,
                      borderWidth:1,
                      borderColor:c.border,
                      padding:16,
                    }}
                  >
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                      <View>
                        <Text style={{fontSize:15,fontWeight:'900',color:c.text}}>Send a message</Text>
                        <Text style={{fontSize:11,color:c.muted,marginTop:2}}>Start a private conversation</Text>
                      </View>
                      <View style={{width:34,height:34,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                        <Ionicons name="paper-plane-outline" size={17} color={c.text}/>
                      </View>
                    </View>

                    <View style={{borderRadius:16,backgroundColor:c.input,borderWidth:1,borderColor:c.border,overflow:'hidden'}}>
                      <TextInput
                        ref={messageInputRef}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Write something…"
                        placeholderTextColor={c.muted}
                        multiline
                        maxLength={5000}
                        style={{
                          minHeight:78,
                          maxHeight:180,
                          color:c.text,
                          paddingHorizontal:14,
                          paddingTop:13,
                          paddingBottom:10,
                          textAlignVertical:'top',
                          fontSize:14,
                          lineHeight:20,
                        }}
                      />
                      <View style={{paddingHorizontal:10,paddingBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
                        <Text style={{fontSize:10,color:c.muted}}>{message.length}/5000</Text>
                        <Pressable
                          disabled={busy||!message.trim()}
                          onPress={()=>void send()}
                          style={({pressed})=>({
                            minHeight:38,
                            paddingHorizontal:15,
                            borderRadius:12,
                            backgroundColor:c.brand,
                            flexDirection:'row',
                            alignItems:'center',
                            justifyContent:'center',
                            gap:6,
                            opacity:busy||!message.trim()?0.42:pressed?0.84:1,
                          })}
                        >
                          <Text style={{fontSize:11,fontWeight:'900',color:c.onBrand}}>Send</Text>
                          <Ionicons name="arrow-up" size={15} color={c.onBrand}/>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              ):null}

              <View style={{paddingHorizontal:20,marginTop:26}}>
                <View style={{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginBottom:12}}>
                  <View>
                    <Text style={{fontSize:20,fontWeight:'900',color:c.text}}>Posts</Text>
                    <Text style={{fontSize:12,color:c.muted,marginTop:3}}>Public activity from this member</Text>
                  </View>
                  {posts.length?(
                    <View style={{paddingHorizontal:9,paddingVertical:5,borderRadius:999,backgroundColor:c.soft}}>
                      <Text style={{fontSize:11,fontWeight:'800',color:c.textSecondary}}>{posts.length}</Text>
                    </View>
                  ):null}
                </View>

                {posts.length?posts.map((item,index)=>(
                  <View
                    key={item.id}
                    style={{
                      borderRadius:22,
                      borderWidth:1,
                      borderColor:c.border,
                      backgroundColor:c.surface,
                      padding:16,
                      marginBottom:12,
                    }}
                  >
                    <View style={{flexDirection:'row',alignItems:'center'}}>
                      {p.avatar_url?(
                        <Image source={{uri:p.avatar_url}} style={{width:38,height:38,borderRadius:19}}/>
                      ):(
                        <View style={{width:38,height:38,borderRadius:19,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                          <Text style={{fontSize:13,fontWeight:'900',color:c.text}}>{initials}</Text>
                        </View>
                      )}
                      <View style={{flex:1,marginLeft:10}}>
                        <Text numberOfLines={1} style={{fontSize:13,fontWeight:'900',color:c.text}}>
                          {p.display_name??'Everest member'}
                        </Text>
                        <Text style={{fontSize:10,color:c.muted,marginTop:2}}>
                          {new Date(item.created_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
                        </Text>
                      </View>
                      <View style={{paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:c.soft}}>
                        <Text style={{fontSize:9,fontWeight:'900',color:c.textSecondary}}>{postTypeLabel(item.post_type)}</Text>
                      </View>
                    </View>

                    <Text style={{fontSize:14,lineHeight:21,color:c.text,marginTop:14}}>
                      {item.caption||postTypeLabel(item.post_type)}
                    </Text>

                    {Array.isArray(item.post_media)&&item.post_media.length>0?(
                      <View style={{marginTop:14,borderRadius:16,backgroundColor:c.input,minHeight:92,alignItems:'center',justifyContent:'center',padding:16}}>
                        <Ionicons name="images-outline" size={22} color={c.muted}/>
                        <Text style={{fontSize:11,color:c.muted,marginTop:7}}>
                          {item.post_media.length} media item{item.post_media.length===1?'':'s'}
                        </Text>
                      </View>
                    ):null}

                    {index<posts.length-1?null:null}
                  </View>
                )):(
                  <View style={{borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:28,alignItems:'center'}}>
                    <View style={{width:54,height:54,borderRadius:27,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                      <Ionicons name="grid-outline" size={22} color={c.muted}/>
                    </View>
                    <Text style={{fontSize:15,fontWeight:'900',color:c.text,marginTop:14}}>Nothing public yet</Text>
                    <Text style={{fontSize:12,lineHeight:18,color:c.muted,textAlign:'center',marginTop:5,maxWidth:280}}>
                      When this member shares public posts, they will appear here.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          {error?(
            <View style={{marginHorizontal:20,marginTop:14,padding:12,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border}}>
              <Text style={{fontSize:12,color:c.danger}}>{error}</Text>
            </View>
          ):null}
        </View>
      </ScrollView>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={()=>setMenuOpen(false)}
      >
        <Pressable
          onPress={()=>setMenuOpen(false)}
          style={{flex:1,backgroundColor:'rgba(0,0,0,0.46)',justifyContent:'flex-end'}}
        >
          <Pressable
            onPress={()=>{}}
            style={{
              width:'100%',
              maxWidth:760,
              alignSelf:'center',
              borderTopLeftRadius:28,
              borderTopRightRadius:28,
              backgroundColor:c.surface,
              paddingHorizontal:18,
              paddingTop:10,
              paddingBottom:28,
              borderWidth:1,
              borderColor:c.border,
            }}
          >
            <View style={{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:16}}/>
            <Text style={{fontSize:17,fontWeight:'900',color:c.text}}>Profile actions</Text>
            <Text style={{fontSize:12,color:c.muted,marginTop:3,marginBottom:14}}>Safety and profile controls</Text>

            <Pressable
              onPress={()=>void confirmReport()}
              style={({pressed})=>({
                minHeight:54,
                borderRadius:16,
                paddingHorizontal:14,
                flexDirection:'row',
                alignItems:'center',
                backgroundColor:pressed?c.soft:c.input,
                marginBottom:8,
              })}
            >
              <View style={{width:34,height:34,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="flag-outline" size={17} color={c.text}/>
              </View>
              <View style={{flex:1,marginLeft:11}}>
                <Text style={{fontSize:13,fontWeight:'800',color:c.text}}>Report profile</Text>
                <Text style={{fontSize:10,color:c.muted,marginTop:2}}>Send this account to Everest for review</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={c.muted}/>
            </Pressable>

            <Pressable
              onPress={()=>void confirmBlock()}
              style={({pressed})=>({
                minHeight:54,
                borderRadius:16,
                paddingHorizontal:14,
                flexDirection:'row',
                alignItems:'center',
                backgroundColor:pressed?c.soft:c.input,
              })}
            >
              <View style={{width:34,height:34,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="ban-outline" size={17} color={c.danger}/>
              </View>
              <View style={{flex:1,marginLeft:11}}>
                <Text style={{fontSize:13,fontWeight:'800',color:c.danger}}>Block user</Text>
                <Text style={{fontSize:10,color:c.muted,marginTop:2}}>Stop connections and messages from this person</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={c.muted}/>
            </Pressable>

            <Pressable
              onPress={()=>setMenuOpen(false)}
              style={({pressed})=>({
                minHeight:48,
                borderRadius:16,
                alignItems:'center',
                justifyContent:'center',
                marginTop:12,
                backgroundColor:pressed?c.soft:'transparent',
              })}
            >
              <Text style={{fontSize:13,fontWeight:'800',color:c.text}}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
