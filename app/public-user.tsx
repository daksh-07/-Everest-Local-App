import {useEffect,useMemo,useRef,useState} from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import {Ionicons} from '@/components/ui/Icon';
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
import {listHighlights,websiteLabel,type StoryHighlight} from '@/lib/social-expansion';
import {signedPostMediaBatch,signedPostMediaResilient} from '@/lib/request-post-media';
import {PostMediaImage} from '@/components/PostMediaImage';
import {userMessage} from '@/lib/errors';
import {formatWhen} from '@/lib/format';
import {ConfirmSheet,EmptyState,HeaderIconButton,ScreenHeader,StatusBadge} from '@/components/ui';

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
  const [postMedia,setPostMedia]=useState<Record<string,string[]>>({});
  const [highlights,setHighlights]=useState<StoryHighlight[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [confirmRemove,setConfirmRemove]=useState(false);
  const [composerOpen,setComposerOpen]=useState(false);
  const messageInputRef=useRef<TextInput|null>(null);

  async function load(){
    if(!userId){setLoading(false);return;}
    setLoading(true);
    setError('');
    try{
      const [profile,content,highlightRows]=await Promise.all([
        getPublicUserProfile(userId),
        publicPostsForUser(userId),
        listHighlights({userId}).catch(()=>[] as StoryHighlight[]),
      ]);
      setP(profile);
      setPosts(content);
      setHighlights(highlightRows);
      try{setPostMedia(await signedPostMediaResilient(content.map(item=>item.id),{onPartialFailure:()=>setError('Some post photos are unavailable. Tap a photo area to retry.')}))}
      catch{setError('Some post photos could not be loaded. Tap a photo area to retry.')}
    }catch(e){
      setError(userMessage(e,'Profile could not be loaded.'));
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
      setError(userMessage(e,'Connection action failed.'));
    }finally{
      setBusy(false);
    }
  }

  async function send():Promise<boolean>{
    if(!p||!message.trim())return false;
    setBusy(true);
    setError('');
    try{
      const conversationId=await sendPersonalMessage(p.id,message.trim());
      setMessage('');
      router.push('/messages?personalId='+conversationId);
      return true;
    }catch(e){
      setError(userMessage(e,'Message could not be sent.'));
      return false;
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
              setError(userMessage(e,'Report could not be sent.'));
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
              setError(userMessage(e,'User could not be blocked.'));
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

  const hasActivity=Boolean(p&&(p.connection_count||posts.length));
  const connected=p?.connection_state==='CONNECTED';
  return (
    <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:96}}>
        <View style={{maxWidth:640,width:'100%',alignSelf:'center',paddingHorizontal:20}}>
          <ScreenHeader title="" fallback="/social" actions={p?<HeaderIconButton icon="ellipsis-horizontal" label="Profile actions" onPress={()=>{if(!busy)setMenuOpen(true)}}/>:null}/>
          {!p?(
            <EmptyState icon="person-outline" title="Profile unavailable" description="This profile may be private, blocked, or no longer available."/>
          ):(
            <>
              <View style={pu.hero}>
                {p.avatar_url?<Image source={{uri:p.avatar_url}} style={pu.avatarImage} accessibilityIgnoresInvertColors/>:<View style={[pu.avatar,{backgroundColor:c.primaryContainer}]}><Text style={[pu.initials,{color:c.onPrimaryContainer}]}>{initials}</Text></View>}
                <Text accessibilityRole="header" variant="title" style={[pu.name,{color:c.text}]}>{p.display_name??'Everest member'}</Text>
                {p.username?<Text style={[pu.handle,{color:c.textSecondary}]}>@{p.username}</Text>:null}
                {p.bio?<Text style={[pu.bio,{color:c.text}]}>{p.bio}</Text>:null}
                <View style={pu.facts}>
                  {p.suburb?<View style={pu.fact}><Ionicons name="location-outline" size={15} color={c.textSecondary}/><Text style={[pu.factText,{color:c.textSecondary}]}>{p.suburb}</Text></View>:null}
                  {joined?<View style={pu.fact}><Ionicons name="calendar-outline" size={15} color={c.textSecondary}/><Text style={[pu.factText,{color:c.textSecondary}]}>Joined {joined}</Text></View>:null}
                  {p.website_url?<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(p.website_url!)} style={pu.fact}><Ionicons name="link-outline" size={15} color={c.accent}/><Text numberOfLines={1} style={[pu.factText,{color:c.accent,maxWidth:200}]}>{websiteLabel(p.website_url)}</Text></Pressable>:null}
                </View>
              </View>

              {hasActivity?<Pressable accessibilityRole="button" accessibilityLabel={`${p.connection_count} connections, ${p.mutual_count} mutual, ${posts.length} posts. View connections`} onPress={()=>router.push('/connections?userId='+p.id)} style={({pressed})=>[pu.stats,{backgroundColor:c.surface,borderColor:c.border},pressed&&{opacity:.8}]}>
                {[[p.connection_count,'Connections'],[p.mutual_count,'Mutual'],[posts.length,'Posts']].map(([value,label],index)=><View key={String(label)} style={[pu.stat,index>0&&{borderLeftWidth:StyleSheet.hairlineWidth,borderLeftColor:c.border}]}><Text tabular style={[pu.statValue,{color:c.text}]}>{value}</Text><Text style={[pu.statLabel,{color:c.textSecondary}]}>{label}</Text></View>)}
              </Pressable>:<Text style={[pu.newMember,{color:c.textSecondary}]}>New to Everest. Say hello or connect to see their posts as they share.</Text>}

              {(canConnect||canMessage)?<View style={pu.actions}>
                {canConnect?<Pressable accessibilityRole="button" accessibilityLabel={connectionLabel} accessibilityHint={connected?'Asks before removing the connection':undefined} accessibilityState={{busy,selected:connected}} disabled={busy} onPress={()=>{if(connected)setConfirmRemove(true);else void connect()}} style={({pressed})=>[pu.primary,connected||p.connection_state==='OUTGOING'?{backgroundColor:c.primaryContainer}:{backgroundColor:c.brand},pressed&&{opacity:.85}]}>
                  {busy?<ActivityIndicator color={connected?c.onPrimaryContainer:c.onBrand}/>:<><Ionicons name={connected?'checkmark-circle':p.connection_state==='OUTGOING'?'time-outline':p.connection_state==='INCOMING'?'mail-unread-outline':'person-add-outline'} size={18} color={connected||p.connection_state==='OUTGOING'?c.onPrimaryContainer:c.onBrand}/><Text style={[pu.primaryText,{color:connected||p.connection_state==='OUTGOING'?c.onPrimaryContainer:c.onBrand}]}>{connectionLabel}</Text></>}
                </Pressable>:null}
                {canMessage?<Pressable accessibilityRole="button" accessibilityLabel="Message" onPress={()=>setComposerOpen(true)} style={({pressed})=>[pu.secondary,{borderColor:c.borderStrong,backgroundColor:c.surface},pressed&&{opacity:.8}]}><Ionicons name="chatbubble-outline" size={18} color={c.text}/><Text style={[pu.secondaryText,{color:c.text}]}>Message</Text></Pressable>:null}
              </View>:null}
              {p.connection_state==='OUTGOING'?<Text style={[pu.hint,{color:c.textSecondary}]}>Request sent. Tap Requested to withdraw it.</Text>:null}

              {highlights.length?<View style={{marginTop:24}}>
                <Text accessibilityRole="header" style={[pu.section,{color:c.text}]}>Highlights</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:14,paddingRight:12,paddingTop:10}}>
                  {highlights.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Highlight: ${item.title}`} onPress={()=>router.push(('/highlight?id='+item.id) as never)} style={{width:76,alignItems:'center'}}>
                    <View style={[pu.ring,{borderColor:c.tertiary,backgroundColor:c.soft}]}>{item.coverUrl?<Image source={{uri:item.coverUrl}} style={{width:58,height:58,borderRadius:29}}/>:<Ionicons name="sparkles-outline" size={21} color={c.accent}/>}</View>
                    <Text numberOfLines={2} style={{fontSize:13,fontWeight:'500',color:c.text,textAlign:'center',marginTop:6}}>{item.title}</Text>
                  </Pressable>)}
                </ScrollView>
              </View>:null}

              <Text accessibilityRole="header" style={[pu.section,{color:c.text,marginTop:28}]}>Posts</Text>
              {posts.length?posts.map(item=><View key={item.id} style={[pu.post,{borderBottomColor:c.border}]}>
                <View style={pu.postHead}><StatusBadge label={postTypeLabel(item.post_type)} tone="neutral"/><Text style={[pu.postTime,{color:c.textSecondary}]}>{formatWhen(item.created_at)}</Text></View>
                {item.caption?<Text style={[pu.caption,{color:c.text}]}>{item.caption}</Text>:null}
                {postMedia[item.id]?.[0]?<View style={{marginTop:14,borderRadius:16,overflow:'hidden'}}><PostMediaImage postId={item.id} uri={postMedia[item.id][0]} style={{width:'100%',height:260,backgroundColor:c.soft}}/>{postMedia[item.id].length>1?<View style={{position:'absolute',right:10,top:10,paddingHorizontal:8,paddingVertical:4,borderRadius:12,backgroundColor:'rgba(0,0,0,.6)'}}><Text style={{fontSize:12,fontWeight:'900',color:'#fff'}}>1/{postMedia[item.id].length}</Text></View>:null}</View>:Array.isArray(item.post_media)&&item.post_media.length>0?<Pressable onPress={()=>void signedPostMediaBatch([item.id],{force:true,strict:true}).then(urls=>setPostMedia(current=>({...current,...urls}))).catch(()=>setError('This post photo is still unavailable. Please try again.'))} style={{marginTop:14,borderRadius:16,backgroundColor:c.input,minHeight:92,alignItems:'center',justifyContent:'center',padding:16}}><Ionicons name="image-outline" size={22} color={c.muted}/><Text style={{fontSize:12,color:c.muted,marginTop:7}}>Photo unavailable · tap to retry</Text></Pressable>:null}
              </View>):<View style={[pu.emptyPosts,{backgroundColor:c.surface,borderColor:c.border}]}><Ionicons name="images-outline" size={22} color={c.accent}/><Text style={[pu.emptyText,{color:c.textSecondary}]}>Nothing public yet. Posts they share will appear here.</Text></View>}

              {error?<View accessibilityRole="alert" style={[pu.error,{borderColor:c.danger,backgroundColor:c.dangerContainer}]}><Text style={{fontSize:14,lineHeight:20,color:c.danger}}>{error}</Text></View>:null}
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmSheet visible={confirmRemove} title={`Remove ${p?.display_name??'this connection'}?`} subtitle="You’ll stop seeing each other’s connection-only posts." note="You can send a new request later. They aren’t notified that you removed them." confirmLabel="Remove connection" destructive busy={busy} onCancel={()=>setConfirmRemove(false)} onConfirm={()=>{void connect().finally(()=>setConfirmRemove(false))}}/>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={()=>setComposerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,justifyContent:'flex-end',backgroundColor:c.overlay}}>
          <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={()=>setComposerOpen(false)}/>
          <SafeAreaView edges={['bottom']} style={[pu.sheet,{backgroundColor:c.canvas}]}>
            <View style={[pu.handleBar,{backgroundColor:c.border}]}/>
            <Text accessibilityRole="header" style={[pu.sheetTitle,{color:c.text}]}>Message {p?.display_name??''}</Text>
            <Text style={[pu.hint,{color:c.textSecondary,marginTop:2}]}>{connected?'Starts a private conversation.':'Sent as a message request. They can accept or decline.'}</Text>
            <TextInput ref={messageInputRef} value={message} onChangeText={setMessage} autoFocus placeholder="Write a message…" placeholderTextColor={c.muted} multiline maxLength={5000} accessibilityLabel="Your message" style={[pu.input,{color:c.text,backgroundColor:c.input,borderColor:c.borderStrong}]}/>
            {error&&composerOpen?<Text accessibilityRole="alert" style={{fontSize:14,lineHeight:20,color:c.danger,marginTop:10}}>{error}</Text>:null}
            <View style={pu.sheetFoot}><Text tabular style={{fontSize:13,color:c.textSecondary}}>{message.length}/5000</Text><Pressable accessibilityRole="button" accessibilityState={{disabled:busy||!message.trim()}} disabled={busy||!message.trim()} onPress={()=>{void send().then(ok=>{if(ok)setComposerOpen(false)})}} style={[pu.send,{backgroundColor:busy||!message.trim()?c.disabled:c.brand}]}>{busy?<ActivityIndicator color={c.onBrand}/>:<Text style={{fontSize:16,fontWeight:'600',color:busy||!message.trim()?c.onDisabled:c.onBrand}}>Send</Text>}</Pressable></View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

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
                <Text style={{fontSize:12,color:c.muted,marginTop:2}}>Send this account to Everest for review</Text>
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
                <Text style={{fontSize:12,color:c.muted,marginTop:2}}>Stop connections and messages from this person</Text>
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

const pu=StyleSheet.create({
  hero:{alignItems:'center',marginTop:4},avatar:{width:96,height:96,borderRadius:48,alignItems:'center',justifyContent:'center'},avatarImage:{width:96,height:96,borderRadius:48},initials:{fontSize:32,fontWeight:'700'},
  name:{textAlign:'center',marginTop:14},handle:{fontSize:15,marginTop:2},bio:{fontSize:16,lineHeight:23,textAlign:'center',marginTop:10,maxWidth:480},
  facts:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',columnGap:14,rowGap:6,marginTop:12},fact:{flexDirection:'row',alignItems:'center',gap:4,minHeight:28},factText:{fontSize:14},
  stats:{flexDirection:'row',marginTop:20,borderRadius:16,borderWidth:StyleSheet.hairlineWidth},stat:{flex:1,alignItems:'center',paddingVertical:12},statValue:{fontSize:19,fontWeight:'700'},statLabel:{fontSize:13,marginTop:2},
  newMember:{fontSize:15,lineHeight:21,textAlign:'center',marginTop:18},
  actions:{flexDirection:'row',gap:10,marginTop:16},primary:{flex:1,minHeight:50,borderRadius:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},primaryText:{fontSize:16,fontWeight:'600'},
  secondary:{flex:1,minHeight:50,borderRadius:16,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},secondaryText:{fontSize:16,fontWeight:'600'},
  hint:{fontSize:13,lineHeight:19,marginTop:8,textAlign:'center'},section:{fontSize:20,fontWeight:'700'},ring:{width:68,height:68,borderRadius:34,borderWidth:2,alignItems:'center',justifyContent:'center'},
  post:{paddingVertical:16,borderBottomWidth:StyleSheet.hairlineWidth},postHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},postTime:{fontSize:13},caption:{fontSize:16,lineHeight:23,marginTop:10},
  emptyPosts:{borderRadius:16,borderWidth:StyleSheet.hairlineWidth,padding:20,alignItems:'center',gap:8,marginTop:12},emptyText:{fontSize:15,lineHeight:21,textAlign:'center'},
  error:{marginTop:16,padding:12,borderRadius:14,borderWidth:1},
  sheet:{borderTopLeftRadius:24,borderTopRightRadius:24,paddingHorizontal:20,paddingTop:8,paddingBottom:12,width:'100%',maxWidth:620,alignSelf:'center'},handleBar:{width:36,height:4,borderRadius:2,alignSelf:'center',marginBottom:14},
  sheetTitle:{fontSize:20,fontWeight:'700'},input:{minHeight:120,maxHeight:220,borderWidth:1,borderRadius:16,paddingHorizontal:14,paddingTop:12,marginTop:14,fontSize:16,lineHeight:22,textAlignVertical:'top'},
  sheetFoot:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:12},send:{minWidth:110,minHeight:48,borderRadius:16,alignItems:'center',justifyContent:'center',paddingHorizontal:20},
});
