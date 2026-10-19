import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,FlatList,Image,KeyboardAvoidingView,Modal,Platform,Pressable,StyleSheet,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {AppText as Text} from '@/components/ui/AppText';
import {AppTextInput as TextInput} from '@/components/ui/AppTextInput';
import {Ionicons} from '@/components/ui/Icon';
import {ErrorBanner} from '@/components/ui';
import {addPostComment,editPostComment,getCommentEngagement,getCommentProfiles,getPostComment,getPostCommentCount,hidePostComment,listPostCommentPage,toggleCommentLike,type CommentEngagement,type PostComment} from '@/lib/social';
import {commentId,commentLength,commentThreads,fitComment,getCommentDraft,mergeComments,saveCommentDraft,saveCommentAttempt,type CommentOrder,type CommentThread} from '@/lib/comment-conversation';
import {supabase} from '@/lib/supabase';
import {useAppTheme,type ThemeColors} from '@/lib/theme';
import {useReducedMotion} from '@/lib/motion';
import {useVisualViewport} from '@/lib/visual-viewport';
import {withTimeout} from '@/lib/resilience';
import {userMessage} from '@/lib/errors';
import {formatAgo} from '@/lib/format';

type Post={id:string;author_id:string;comments_enabled:boolean;caption:string|null;engagement:{commentCount:number}};
/** Resolve identity from the active auth session, never from the feed's cached author state. */
export function PostCommentsSheet(props:Omit<React.ComponentProps<typeof CommentConversation>,'viewerId'>){
 const {colors}=useAppTheme();const [identity,setIdentity]=useState<{ready:boolean;id:string|null;error:string}>({ready:false,id:null,error:''});const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;let identityVersion=0;const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(active){identityVersion++;setIdentity({ready:true,id:session?.user.id??null,error:''});}});
  const requestedIdentity=identityVersion;void supabase.auth.getSession().then(({data,error})=>{if(!active||requestedIdentity!==identityVersion)return;if(error)setIdentity({ready:false,id:null,error:'Your sign-in could not be checked. Try again.'});else setIdentity({ready:true,id:data.session?.user.id??null,error:''});}).catch(()=>{if(active)setIdentity({ready:false,id:null,error:'Your sign-in could not be checked. Try again.'});});
  return()=>{active=false;subscription.unsubscribe();};
 },[retry]);
 if(identity.ready)return <CommentConversation key={`${props.post.id}:${identity.id??'guest'}`} {...props} viewerId={identity.id}/>;
 return <Modal visible transparent animationType="none" onRequestClose={props.onClose}><View style={{flex:1,justifyContent:'flex-end',alignItems:'center',backgroundColor:colors.overlay}}><View role="dialog" aria-modal accessibilityLabel="Post comments" style={{width:'100%',maxWidth:640,padding:24,minHeight:180,backgroundColor:colors.canvas,borderTopLeftRadius:24,borderTopRightRadius:24,gap:12}}>
  <Text accessibilityRole="header" style={{fontSize:21,fontWeight:'700',color:colors.text}}>Comments</Text>{identity.error?<ErrorBanner message={identity.error} onRetry={()=>setRetry(value=>value+1)} retryLabel="Retry sign-in check"/>:<ActivityIndicator color={colors.accent}/>}
  <Pressable accessibilityRole="button" accessibilityLabel="Close comments" onPress={props.onClose} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.text}}>Close</Text></Pressable>
 </View></View></Modal>;
}
function CommentConversation({post,viewerId,linkedCommentId,onClose,onCountChange}:{post:Post;viewerId:string|null;linkedCommentId?:string;onClose:()=>void;onCountChange:(delta:number,total?:number)=>void}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const reduced=useReducedMotion();const insets=useSafeAreaInsets();const {height,width}=useWindowDimensions();const viewport=useVisualViewport();
 const draftKey=`${viewerId??'guest'}:${post.id}`;const draft=useRef(getCommentDraft(draftKey)).current;
 const [text,setText]=useState(draft.text);const [reply,setReply]=useState<PostComment|null>(draft.reply);const [editing,setEditing]=useState<PostComment|null>(null);const [editText,setEditText]=useState('');
 const [rows,setRows]=useState<PostComment[]>([]);const [order,setOrder]=useState<CommentOrder>('NEWEST');const [loading,setLoading]=useState(true);const [moreBusy,setMoreBusy]=useState(false);const [hasMore,setHasMore]=useState(false);const [cursor,setCursor]=useState<PostComment|null>(null);
 const [loadError,setLoadError]=useState('');const [moreError,setMoreError]=useState('');const [actionError,setActionError]=useState('');const [likesError,setLikesError]=useState('');const [status,setStatus]=useState('');
 const [likes,setLikes]=useState<Record<string,CommentEngagement>>({});const [liking,setLiking]=useState<Record<string,boolean>>({});const [busy,setBusy]=useState(false);const [hide,setHide]=useState<PostComment|null>(null);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});const [notice,setNotice]=useState<string|null>(null);const [focused,setFocused]=useState(false);const [inputHeight,setInputHeight]=useState(44);
 const mounted=useRef(true);const version=useRef(0);const mutation=useRef(false);const countVersion=useRef(0);const moreLock=useRef(false);const pending=useRef<{id:string;body:string;parent:string|null}|null>(draft.attempt);const likeLocks=useRef(new Set<string>());const disconnected=useRef(false);const likeVersion=useRef<Record<string,number>>({});const failedLikes=useRef(new Set<string>());const jumped=useRef(false);const jumpAttempts=useRef(0);
 const closeButton=useRef<React.ElementRef<typeof View>>(null);const cancelHide=useRef<React.ElementRef<typeof View>>(null);
 const input=useRef<React.ComponentRef<typeof TextInput>>(null);const list=useRef<FlatList<CommentThread>>(null);const callbacks=useRef({onClose,onCountChange});callbacks.current={onClose,onCountChange};
 const current=(v:number)=>mounted.current&&v===version.current;
 const reactions=useCallback(async(items:PostComment[],v:number)=>{
  const revisions=Object.fromEntries(items.map(item=>[item.id,likeVersion.current[item.id]??0]));
  try{const result=await withTimeout(getCommentEngagement(items.map(item=>item.id)),12000,'Comment likes');if(!mounted.current||v!==version.current)return;
   setLikes(previous=>{const next={...previous};for(const [id,value] of Object.entries(result))if((likeVersion.current[id]??0)===revisions[id])next[id]=value;return next;});for(const item of items)failedLikes.current.delete(item.id);setLikesError(failedLikes.current.size?'Likes are unavailable. You can still read and reply.':'');
  }catch{if(mounted.current&&v===version.current){for(const item of items)failedLikes.current.add(item.id);setLikesError('Likes are unavailable. You can still read and reply.');}}
 },[]);
 const authors=useCallback(async(items:PostComment[],v:number)=>{
  try{const profiles=await withTimeout(getCommentProfiles(items.map(row=>row.author_id)),12000,'Comment authors');if(!mounted.current||v!==version.current)return;setRows(previous=>previous.map(row=>profiles.has(row.author_id)?{...row,profile:profiles.get(row.author_id)}:row));}catch{/* A missing public profile never blocks a conversation. */}
 },[]);
 const load=useCallback(async()=>{
  const v=++version.current;moreLock.current=false;setMoreBusy(false);failedLikes.current.clear();jumped.current=false;setLoading(true);setLoadError('');setMoreError('');setLikesError('');setNotice(disconnected.current?'Live updates paused · Refresh comments':null);setRows([]);setLikes({});setHasMore(false);setCursor(null);
  try{const page=await withTimeout(listPostCommentPage(post.id,{order}),12000,'Comments');if(!mounted.current||v!==version.current)return;
   setRows(page.comments);setHasMore(page.hasMore);setCursor(page.cursor);void reactions(page.comments,v);void authors(page.comments,v);
   if(linkedCommentId&&!page.comments.some(row=>row.id===linkedCommentId))void withTimeout(getPostComment(post.id,linkedCommentId),12000,'Linked comment').then(row=>{if(!mounted.current||v!==version.current)return;if(row){setRows(previous=>mergeComments(previous,[row]));void reactions([row],v);void authors([row],v);}else setActionError('The linked comment is no longer available.');}).catch(()=>{if(mounted.current&&v===version.current)setActionError('The linked comment could not load. Other comments are still available.');});
  }catch(e){if(mounted.current&&v===version.current)setLoadError(userMessage(e,'Comments could not load. Try again.'));}
  finally{if(mounted.current&&v===version.current)setLoading(false);}
 },[post.id,order,reactions,authors,linkedCommentId]);
 useEffect(()=>{const guard=version;mounted.current=true;void load();return()=>{mounted.current=false;guard.current++;};},[load]);
 useEffect(()=>{saveCommentDraft(draftKey,text,reply);},[draftKey,text,reply]);
 useEffect(()=>{
  const channel=supabase.channel(`post-comments:${post.id}`).on('postgres_changes',{event:'*',schema:'public',table:'post_comments',filter:`post_id=eq.${post.id}`},payload=>{if(mounted.current&&(payload.new as {id?:string}).id!==pending.current?.id)setNotice('New comment activity · Refresh');}).subscribe(status=>{
   if(!mounted.current)return;
   if(status==='SUBSCRIBED'){if(disconnected.current)setNotice('Connected again · Refresh comments');disconnected.current=false;}
   if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){disconnected.current=true;setNotice('Live updates paused · Refresh comments');}
  });
  const app=AppState.addEventListener('change',state=>{if(state==='active')setNotice('Check latest comments · Refresh');});
  return()=>{app.remove();void supabase.removeChannel(channel);};
 },[post.id]);
 const threads=useMemo(()=>commentThreads(rows,order),[rows,order]);
 useEffect(()=>{if(!linkedCommentId)return;const index=threads.findIndex(thread=>thread.root?.id===linkedCommentId||thread.replies.some(row=>row.id===linkedCommentId));if(index<0)return;
  setExpanded(previous=>previous[linkedCommentId]?previous:{...previous,[linkedCommentId]:true});
  if(jumped.current)return;jumped.current=true;jumpAttempts.current=0;const timer=setTimeout(()=>{if(mounted.current)list.current?.scrollToIndex({index,animated:false});},100);return()=>clearTimeout(timer);
 },[linkedCommentId,threads]);
 function threadOpen(thread:CommentThread){return Boolean(expanded[thread.root?.id??'']||thread.replies.some(row=>expanded[row.id]));}

 async function more(){
  if(!cursor||moreLock.current||loading)return;moreLock.current=true;setMoreBusy(true);setMoreError('');const v=version.current;
  try{const page=await withTimeout(listPostCommentPage(post.id,{order,cursor}),12000,'More comments');if(!current(v))return;setRows(previous=>mergeComments(previous,page.comments));setHasMore(page.hasMore);setCursor(page.cursor);void reactions(page.comments,v);void authors(page.comments,v);}
  catch(e){if(current(v))setMoreError(userMessage(e,'More comments could not load. Your conversation is still here.'));}
  finally{if(current(v)){moreLock.current=false;setMoreBusy(false);}}
 }
 function close(){if(mutation.current)return;saveCommentDraft(draftKey,text,reply);callbacks.current.onClose();}
 function signIn(){close();router.push('/auth');}
 function changeText(value:string){if(editing)setEditText(fitComment(value));else setText(fitComment(value));setActionError('');setStatus('');}
 function syncCount(delta:number){
  const revision=++countVersion.current;callbacks.current.onCountChange(delta);
  void withTimeout(getPostCommentCount(post.id),12000,'Comment count').then(total=>{if(mounted.current&&revision===countVersion.current)callbacks.current.onCountChange(0,total);}).catch(()=>undefined);
 }
 async function send(){
  const body=(editing?editText:text).trim();if(mutation.current||!body||commentLength(body)>2000||!viewerId||!post.comments_enabled)return;
  mutation.current=true;setBusy(true);setActionError('');setStatus('');
  try{
   if(editing){const updated=await withTimeout(editPostComment(editing,body),20000,'Save comment');if(!mounted.current)return;setRows(previous=>previous.map(row=>row.id===updated.id?{...row,...updated}:row));setEditing(null);setStatus('Comment updated.');}
   else{
    const parent=reply?.id??null;if(!pending.current||pending.current.body!==body||pending.current.parent!==parent)pending.current={id:commentId(),body,parent};saveCommentAttempt(draftKey,pending.current);
    const added=await withTimeout(addPostComment(post.id,body,parent,pending.current.id),20000,'Post comment');if(!mounted.current)return;
    setRows(previous=>mergeComments(previous,[added]));setLikes(previous=>({...previous,[added.id]:{likedByMe:false,likeCount:0}}));syncCount(rows.some(row=>row.id===added.id)?0:1);
    if(reply){const thread=threads.find(thread=>thread.root?.id===reply.id||thread.replies.some(row=>row.id===reply.id));if(thread)setExpanded(previous=>({...previous,[thread.root?.id??thread.replies[0].id]:true}));}
    else requestAnimationFrame(()=>{if(!mounted.current)return;if(order==='OLDEST')list.current?.scrollToEnd({animated:false});else list.current?.scrollToOffset({offset:0,animated:false});});
    setText('');setReply(null);saveCommentDraft(draftKey,'',null);pending.current=null;setStatus('Comment posted.');
   }
  }catch(e){if(mounted.current)setActionError(userMessage(e,'Your comment could not be saved. Your draft is still here; try again.'));}
  finally{mutation.current=false;if(mounted.current)setBusy(false);}
 }
 async function like(row:PostComment){
  const before=likes[row.id];if(!viewerId){signIn();return;}if(!before||likeLocks.current.has(row.id))return;
  likeLocks.current.add(row.id);likeVersion.current[row.id]=(likeVersion.current[row.id]??0)+1;setLiking(previous=>({...previous,[row.id]:true}));setActionError('');
  setLikes(previous=>({...previous,[row.id]:{likedByMe:!before.likedByMe,likeCount:Math.max(0,before.likeCount+(before.likedByMe?-1:1))}}));
  try{await withTimeout(toggleCommentLike(row.id,before.likedByMe),12000,'Like comment');if(mounted.current){likeVersion.current[row.id]++;setLikes(previous=>({...previous,[row.id]:{likedByMe:!before.likedByMe,likeCount:Math.max(0,before.likeCount+(before.likedByMe?-1:1))}}));}}
  catch{if(mounted.current){likeVersion.current[row.id]++;setLikes(previous=>({...previous,[row.id]:before}));setActionError('Your like was not saved. Try again.');}}
  finally{likeLocks.current.delete(row.id);if(mounted.current)setLiking(previous=>({...previous,[row.id]:false}));}
 }
 async function confirmHide(){
  if(!hide||mutation.current)return;mutation.current=true;setBusy(true);setActionError('');
  try{await withTimeout(hidePostComment(hide.id),12000,'Hide comment');if(!mounted.current)return;setRows(previous=>previous.filter(row=>row.id!==hide.id));if(reply?.id===hide.id)setReply(null);setHide(null);syncCount(-1);setStatus('Comment hidden.');}
  catch(e){if(mounted.current){setHide(null);setActionError(userMessage(e,'Comment could not be hidden. Try again.'));}}
  finally{mutation.current=false;if(mounted.current)setBusy(false);}
 }
 function startReply(row:PostComment){if(!viewerId){signIn();return;}setEditing(null);setReply(row);setActionError('');input.current?.focus();}
 const keyboard=Platform.OS==='web'&&viewport.keyboardInset>0;const usable=keyboard?(viewport.height??height):height;const sheetHeight=Math.min(720,Math.max(240,usable*(keyboard ? .98 : .88)));
 const value=editing?editText:text;const length=commentLength(value);const enabled=Boolean(value.trim())&&length<=2000&&!busy;
 function rowView(row:PostComment,replyRow=false){
  const name=row.author_id===viewerId?'You':row.profile?.display_name??'Everest member';const engagement=likes[row.id];const own=row.author_id===viewerId;const canHide=own||post.author_id===viewerId;
  return <View key={row.id} style={[s.comment,replyRow&&s.reply,row.id===linkedCommentId&&{backgroundColor:colors.soft}]}>
   {row.profile?.avatar_url?<Image source={{uri:row.profile.avatar_url}} style={[s.avatar,replyRow&&s.smallAvatar]}/>:<View style={[s.avatar,replyRow&&s.smallAvatar]}><Text style={s.initial}>{name.slice(0,1).toUpperCase()}</Text></View>}
   <View style={s.commentContent}><View style={s.meta}><Text style={s.name}>{name}</Text>{row.author_id===post.author_id?<Text style={s.author}>Author</Text>:null}<Text style={s.time}>{formatAgo(row.created_at)}{row.updated_at!==row.created_at?' · edited':''}</Text></View><Text selectable style={s.body}>{row.body}</Text>
    <View style={s.actions}>{post.comments_enabled?<Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${name}`} disabled={busy} onPress={()=>startReply(row)} style={s.action}><Text style={s.actionText}>Reply</Text></Pressable>:null}
     <Pressable accessibilityRole="button" accessibilityLabel={engagement?`${engagement.likedByMe?'Unlike':'Like'} comment by ${name}${engagement.likeCount?', '+engagement.likeCount+' likes':''}`:'Comment likes loading or unavailable'} aria-pressed={Boolean(engagement?.likedByMe)} disabled={Boolean(liking[row.id])||!engagement} onPress={()=>void like(row)} style={s.action}>{liking[row.id]?<ActivityIndicator size="small" color={colors.accent}/>:<Ionicons name={engagement?.likedByMe?'heart':'heart-outline'} size={17} color={engagement?.likedByMe?colors.danger:colors.textSecondary}/>}<Text style={s.actionText}>{engagement?.likeCount??'—'}</Text></Pressable>
     {own&&post.comments_enabled?<Pressable accessibilityRole="button" accessibilityLabel="Edit your comment" disabled={busy} onPress={()=>{setEditing(row);setEditText(row.body);setActionError('');input.current?.focus();}} style={s.action}><Text style={s.actionText}>Edit</Text></Pressable>:null}
     {canHide?<Pressable accessibilityRole="button" accessibilityLabel={`Hide comment by ${name}`} disabled={busy} onPress={()=>setHide(row)} style={s.action}><Text style={s.actionText}>Hide</Text></Pressable>:null}
    </View></View>
  </View>;
 }
 return <Modal visible transparent onShow={()=>{if(Platform.OS==='web')closeButton.current?.focus();}} animationType={reduced?'none':'slide'} onRequestClose={close}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={[s.host,Platform.OS==='web'&&{flex:0,position:'absolute',left:0,right:0,height:usable,top:keyboard?viewport.offsetTop:0},width>=768&&{justifyContent:'center'}]}>
   <Pressable accessible={false} focusable={false} onPress={close} style={StyleSheet.absoluteFill}/>
   <View role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel="Post comments" style={[s.sheet,{height:sheetHeight,paddingBottom:keyboard?8:Math.max(insets.bottom,12)}]}>
    {Platform.OS==='web'?<style>{'#everest-comment-input:focus-visible { outline: none !important; }'}</style>:null}
    <View style={s.handle}/><View style={s.header}><View style={{flex:1,minWidth:0}}><Text accessibilityRole="header" style={s.title}>Comments</Text><Text style={s.subtitle}>{loading?'Loading conversation…':loadError?'Conversation unavailable':`${Math.max(post.engagement.commentCount,rows.length)}${hasMore&&rows.length>=post.engagement.commentCount?'+':''} comments`}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh comments" disabled={busy||loading} onPress={()=>void load()} style={s.icon}><Ionicons name="refresh-outline" size={21} color={colors.text}/></Pressable><Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Close comments" disabled={busy} onPress={close} style={s.icon}><Ionicons name="close" size={23} color={colors.text}/></Pressable></View>
    {post.caption?<Text numberOfLines={1} style={s.postContext}>{post.caption}</Text>:null}
    <View accessibilityRole="tablist" style={s.sort}>{(['NEWEST','OLDEST'] as const).map(item=><Pressable key={item} accessibilityRole="tab" accessibilityState={{selected:order===item}} disabled={busy} onPress={()=>setOrder(item)} style={[s.sortButton,order===item&&{backgroundColor:colors.soft}]}><Text style={s.actionText}>{item==='NEWEST'?'Newest first':'Oldest first'}</Text></Pressable>)}</View>
    {notice?<Pressable accessibilityRole="button" disabled={busy||loading} onPress={()=>void load()} style={s.notice}><Text style={s.link}>{notice}</Text></Pressable>:null}
    {loading?<View style={s.center}><ActivityIndicator color={colors.accent}/><Text style={s.subtitle}>Loading comments…</Text></View>:loadError?<View style={s.center}><ErrorBanner message={loadError} onRetry={()=>void load()} retryLabel="Retry comments"/></View>:<FlatList ref={list} data={threads} keyExtractor={thread=>thread.id} style={s.list} onScrollToIndexFailed={info=>{list.current?.scrollToOffset({offset:Math.max(0,info.averageItemLength*info.index),animated:false});if(jumpAttempts.current++<2)setTimeout(()=>{if(mounted.current)list.current?.scrollToIndex({index:info.index,animated:false});},150);}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{paddingBottom:12,flexGrow:threads.length?0:1}}
     ListEmptyComponent={<View style={s.center}><Ionicons name="chatbubbles-outline" size={28} color={colors.textSecondary}/><Text style={s.emptyTitle}>No comments yet</Text><Text style={s.emptyCopy}>{post.comments_enabled?'Ask a question or share a helpful thought.':'Comments are turned off for this post.'}</Text></View>}
     renderItem={({item:thread})=><View>{thread.root?rowView(thread.root):<Text style={s.context}>Replying to an earlier or unavailable comment</Text>}{thread.replies.length?<><Pressable accessibilityRole="button" accessibilityState={{expanded:threadOpen(thread)}} onPress={()=>setExpanded(previous=>{const next={...previous};for(const row of [thread.root,...thread.replies])if(row)next[row.id]=false;next[thread.root?.id??thread.replies[0].id]=!threadOpen(thread);return next;})} style={s.threadToggle}><Ionicons name={threadOpen(thread)?'chevron-up':'chevron-down'} size={16} color={colors.textSecondary}/><Text style={s.link}>{threadOpen(thread)?'Hide':`View ${thread.replies.length}`} {thread.replies.length===1?'reply':'replies'}</Text></Pressable>{threadOpen(thread)?thread.replies.map(row=>rowView(row,true)):null}</>:null}</View>}
     ListFooterComponent={moreError?<ErrorBanner message={moreError} onRetry={()=>void more()} retryLabel="Retry more comments"/>:hasMore?<Pressable accessibilityRole="button" disabled={moreBusy||busy} onPress={()=>void more()} style={s.more}>{moreBusy?<ActivityIndicator color={colors.accent}/>:<Text style={s.link}>Load more comments</Text>}</Pressable>:null}/>} 
    {likesError?<View accessibilityRole="alert" style={s.feedback}><Text style={s.feedbackText}>{likesError}</Text><Pressable accessibilityRole="button" onPress={()=>void reactions(rows,version.current)} style={s.action}><Text style={s.link}>Retry likes</Text></Pressable></View>:null}
    {actionError?<View accessibilityRole="alert" style={s.feedback}><Text style={s.feedbackText}>{actionError}</Text></View>:null}{status?<Text accessibilityLiveRegion="polite" style={s.status}>{status}</Text>:null}
    {!viewerId?<Pressable accessibilityRole="button" onPress={signIn} style={s.signIn}><Text style={s.link}>Sign in to join the conversation</Text></Pressable>:!post.comments_enabled?<Text style={s.disabledCopy}>Comments are turned off. You can still read the conversation.</Text>:<View style={s.composerArea}>
     {reply||editing?<View style={s.replyBanner}><Text numberOfLines={1} style={s.replyText}>{editing?'Editing your comment':`Replying to ${reply?.author_id===viewerId?'you':reply?.profile?.display_name??'Everest member'}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={editing?'Cancel editing':'Cancel reply'} disabled={busy} onPress={()=>{if(editing)setEditing(null);else setReply(null);setActionError('');}} style={s.icon}><Ionicons name="close" size={18} color={colors.textSecondary}/></Pressable></View>:null}
     {!keyboard&&!editing?<View style={s.emojiRow}>{['❤️','😂','🔥','🙌'].map(emoji=><Pressable accessibilityRole="button" accessibilityLabel={`Add ${emoji} to comment`} key={emoji} disabled={busy} onPress={()=>{changeText(text+emoji);input.current?.focus();}} style={s.emoji}><Text style={{fontSize:20}}>{emoji}</Text></Pressable>)}</View>:null}
     <View style={[s.composer,focused&&{borderColor:colors.accent,borderWidth:2,padding:3}]}><TextInput nativeID="everest-comment-input" ref={input} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} accessibilityLabel={editing?'Edit comment':reply?'Write a reply':'Add a comment'} placeholder={editing?'Edit your comment…':reply?'Write a reply…':'Add a comment…'} placeholderTextColor={colors.textSecondary} value={value} onChangeText={changeText} editable={!busy} multiline maxLength={4000} autoCapitalize="sentences" textAlignVertical="top" onContentSizeChange={event=>setInputHeight(Math.max(44,Math.min(120,event.nativeEvent.contentSize.height)))} style={[s.input,{height:Math.min(inputHeight,usable<420?72:120)}]}/><Pressable accessibilityRole="button" accessibilityLabel={busy?'Saving comment':editing?'Save comment changes':'Post comment'} disabled={!enabled} onPress={()=>void send()} style={[s.send,!enabled&&{opacity:.45}]}>{busy?<ActivityIndicator size="small" color={colors.onBrand}/>:<Ionicons name="arrow-up" size={21} color={colors.onBrand}/>}</Pressable></View>
     {length>=1800?<Text style={s.counter}>{length} / 2,000</Text>:null}
    </View>}
   </View>
  </KeyboardAvoidingView>
  <Modal visible={Boolean(hide)} transparent animationType={reduced?'none':'fade'} onRequestClose={()=>{if(!mutation.current)setHide(null);}} onShow={()=>{if(Platform.OS==='web')cancelHide.current?.focus();}}><View style={s.confirmHost}><View role="alertdialog" aria-modal accessibilityViewIsModal accessibilityLabel="Hide comment confirmation" style={s.confirm}>
   <Text accessibilityRole="header" style={s.title}>Hide this comment?</Text><Text numberOfLines={5} style={s.body}>{hide?.body}</Text><Text style={s.emptyCopy}>This comment will no longer appear. Replies remain visible.</Text>
   <Pressable ref={cancelHide} accessibilityRole="button" disabled={busy} onPress={()=>setHide(null)} style={s.more}><Text style={s.link}>Keep comment</Text></Pressable>
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void confirmHide()} style={[s.more,{backgroundColor:colors.danger,borderRadius:12}]}>{busy?<ActivityIndicator color={colors.canvas}/>:<Text style={{fontSize:15,fontWeight:'600',color:colors.canvas}}>Hide comment</Text>}</Pressable>
  </View></View></Modal>
 </Modal>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 confirmHost:{flex:1,backgroundColor:c.overlay,alignItems:'center',justifyContent:'center',padding:20},confirm:{width:'100%',maxWidth:440,backgroundColor:c.canvas,padding:20,borderRadius:20,gap:12},feedback:{minHeight:44,paddingHorizontal:16,paddingVertical:6,flexDirection:'row',gap:8,alignItems:'center'},feedbackText:{flex:1,fontSize:13,lineHeight:18,color:c.textSecondary},host:{flex:1,backgroundColor:c.overlay,justifyContent:'flex-end',alignItems:'center'},sheet:{flexShrink:1,maxHeight:'100%',width:'100%',maxWidth:640,backgroundColor:c.canvas,borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden'},handle:{width:36,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginTop:9},header:{paddingHorizontal:16,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:4},title:{fontSize:21,lineHeight:27,fontWeight:'700',color:c.text},subtitle:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:3},icon:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:22},postContext:{fontSize:13,lineHeight:18,color:c.textSecondary,marginHorizontal:16,marginBottom:6},sort:{flexDirection:'row',gap:8,paddingHorizontal:16,paddingBottom:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border},sortButton:{minHeight:44,paddingHorizontal:12,borderRadius:12,justifyContent:'center'},list:{flex:1,minHeight:0},center:{flex:1,minHeight:90,alignItems:'center',justifyContent:'center',padding:20,gap:8},emptyTitle:{fontSize:18,fontWeight:'600',color:c.text,marginTop:8},emptyCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,textAlign:'center'},comment:{flexDirection:'row',paddingHorizontal:16,paddingTop:14,gap:10},commentContent:{flex:1,minWidth:0},reply:{marginLeft:22,paddingTop:8,borderLeftWidth:1,borderLeftColor:c.border},avatar:{width:34,height:34,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},smallAvatar:{width:26,height:26,borderRadius:13},initial:{fontSize:14,fontWeight:'600',color:c.textSecondary},meta:{flexDirection:'row',gap:6,alignItems:'center',flexWrap:'wrap'},name:{fontSize:14,lineHeight:19,fontWeight:'600',color:c.text,flexShrink:1},author:{fontSize:12,fontWeight:'600',color:c.accent},time:{fontSize:12,lineHeight:17,color:c.textSecondary},body:{fontSize:15,lineHeight:22,color:c.text,marginTop:4},actions:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4},action:{minWidth:44,minHeight:44,paddingHorizontal:5,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},actionText:{fontSize:13,fontWeight:'600',color:c.textSecondary},threadToggle:{minHeight:44,marginLeft:58,paddingHorizontal:8,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:5},link:{fontSize:14,lineHeight:20,fontWeight:'600',color:c.accent},context:{fontSize:13,lineHeight:18,color:c.textSecondary,marginHorizontal:20,marginTop:12},more:{minHeight:48,alignItems:'center',justifyContent:'center',marginTop:8},notice:{minHeight:44,paddingHorizontal:16,justifyContent:'center',backgroundColor:c.soft},status:{fontSize:13,lineHeight:18,color:c.textSecondary,paddingHorizontal:16,paddingVertical:5},composerArea:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,paddingHorizontal:12,paddingTop:4},replyBanner:{minHeight:44,flexDirection:'row',alignItems:'center',paddingLeft:8},replyText:{flex:1,fontSize:13,color:c.textSecondary},emojiRow:{flexDirection:'row',gap:8},emoji:{width:44,height:44,alignItems:'center',justifyContent:'center'},composer:{borderWidth:1,borderColor:c.border,borderRadius:22,backgroundColor:c.surface,flexDirection:'row',alignItems:'flex-end',gap:6,padding:4},input:{outlineWidth:0,flex:1,minWidth:0,fontSize:16,lineHeight:22,color:c.text,paddingHorizontal:10,paddingVertical:10},send:{width:44,height:44,borderRadius:22,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},counter:{fontSize:12,lineHeight:17,textAlign:'right',color:c.textSecondary,paddingTop:3,paddingRight:6},signIn:{minHeight:56,alignItems:'center',justifyContent:'center',padding:12,borderTopWidth:1,borderTopColor:c.border},disabledCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,padding:16,textAlign:'center'}
});
