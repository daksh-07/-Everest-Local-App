import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversations, markMessageRead, messages, sendMessage } from '@/lib/messaging';
import { currentUser } from '@/lib/marketplace';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Message = { id: string; sender_id: string; body: string; read_at: string | null; created_at: string };
type ConversationItem = { id: string; customer_id: string; business_id: string; request_id: string | null; booking_id: string | null; quote_id: string | null; created_at: string; counterpart_name?: string; counterpart_avatar?: string | null };

export default function Messages() {
  const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const requestedId = typeof params.conversationId === 'string' ? params.conversationId : '';
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [selected, setSelected] = useState<ConversationItem | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadRefreshing, setThreadRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [threadError, setThreadError] = useState('');

  const loadList = useCallback(async (refresh = false) => {
    setListError('');
    if (refresh) setRefreshing(true); else if (!items.length) setLoading(true);
    try {
      const [data, user] = await Promise.all([conversations(), currentUser()]);
      const raw = data as ConversationItem[];
      const businessIds = [...new Set(raw.map(item => item.business_id))];
      const customerIds = [...new Set(raw.map(item => item.customer_id))];
      const { supabase } = await import('@/lib/supabase');
      const [{ data: businessRows, error: businessError }, { data: profileRows, error: profileError }] = await Promise.all([
        businessIds.length ? supabase.from('businesses').select('id,name,logo_url').in('id', businessIds) : Promise.resolve({data:[],error:null}),
        customerIds.length ? supabase.from('public_profiles').select('id,display_name,avatar_url').in('id', customerIds).eq('visibility','PUBLIC') : Promise.resolve({data:[],error:null}),
      ]);
      if (businessError || profileError) throw new Error('counterpart lookup failed');
      const businessMap = Object.fromEntries((businessRows ?? []).map(item => [item.id, item]));
      const profileMap = Object.fromEntries((profileRows ?? []).map(item => [item.id, item]));
      const currentId = user?.id ?? '';
      const enriched = raw.map(item => {
        const counterpart = item.customer_id === currentId ? businessMap[item.business_id] : profileMap[item.customer_id];
        return {...item,counterpart_name:counterpart?.name ?? counterpart?.display_name ?? 'Marketplace member',counterpart_avatar:counterpart?.logo_url ?? counterpart?.avatar_url ?? null};
      });
      setItems(enriched); setUserId(currentId);
      if (requestedId) { const found = enriched.find(item => item.id === requestedId); if (found) setSelected(found); }
    } catch {
      setListError(items.length ? 'Messages could not be refreshed. Showing your last loaded conversations.' : 'Messages could not be loaded. Please try again.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [requestedId, items.length]);

  const loadThread = useCallback(async (id: string, refresh = false) => {
    setThreadError('');
    if (refresh) setThreadRefreshing(true); else if (!thread.length) setThreadLoading(true);
    try {
      const data = await messages(id);
      setThread(data as Message[]);
      await Promise.allSettled((data as Message[]).filter(message => !message.read_at && message.sender_id !== userId).map(message => markMessageRead(message.id)));
    } catch {
      setThreadError(thread.length ? 'Conversation could not be refreshed. Showing the last loaded messages.' : 'Conversation could not be loaded. Please try again.');
    } finally { setThreadLoading(false); setThreadRefreshing(false); }
  }, [userId, thread.length]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selected) { setThread([]); void loadThread(selected.id); } }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!selected || !draft.trim() || busy || threadRefreshing) return;
    setBusy(true); setThreadError('');
    try { await sendMessage(selected.id, draft.trim()); setDraft(''); await loadThread(selected.id, true); }
    catch { setThreadError('Message could not be sent. Your draft has been kept so you can retry.'); }
    finally { setBusy(false); }
  }

  if (selected) return <SafeAreaView style={s.safe}><View style={s.header}><Pressable disabled={busy} onPress={() => { setSelected(null); setThread([]); setThreadError(''); router.replace('/messages'); }}><Text style={s.back}>‹ Messages</Text></Pressable><Text style={s.title}>{selected.counterpart_name||'Conversation'}</Text><Text style={s.copy}>Only authorized marketplace participants can read or send messages.</Text></View><ScrollView refreshControl={<RefreshControl refreshing={threadRefreshing} onRefresh={() => void loadThread(selected.id, true)}/>} contentContainerStyle={s.thread}>{threadLoading ? <ActivityIndicator/> : thread.length ? thread.map(message => <View key={message.id} style={[s.bubble, message.sender_id === userId ? s.mine : s.theirs]}><Text style={[s.body, message.sender_id === userId ? s.mineBody : s.theirsBody]}>{message.body}</Text><Text style={s.time}>{new Date(message.created_at).toLocaleString()}</Text></View>) : !threadError ? <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Send a message to start the conversation.</Text></View> : null}{!!threadError && <View style={s.errorBox}><Text style={s.error}>{threadError}</Text><Pressable onPress={() => void loadThread(selected.id, true)} disabled={threadLoading||threadRefreshing} style={s.retry}><Text style={s.retryText}>{threadLoading||threadRefreshing ? 'RETRYING…' : 'RETRY CONVERSATION'}</Text></Pressable></View>}</ScrollView><View style={s.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor={colors.muted} multiline maxLength={5000} editable={!busy} style={s.input}/><Pressable disabled={busy || threadRefreshing || !draft.trim()} onPress={() => void submit()} style={[s.button,(busy||threadRefreshing||!draft.trim())&&s.disabled]}><Text style={s.buttonText}>{busy ? 'SENDING…' : 'SEND'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadList(true)}/>} contentContainerStyle={s.page}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Messages</Text><Text style={s.copy}>Conversations are only visible to their authorized participants.</Text>{loading ? <ActivityIndicator/> : <>{!!listError && <View style={s.errorBox}><Text style={s.error}>{listError}</Text><Pressable onPress={() => void loadList(true)} disabled={refreshing} style={s.retry}><Text style={s.retryText}>{refreshing ? 'RETRYING…' : 'RETRY MESSAGES'}</Text></Pressable></View>}{items.length ? items.map(item => <Pressable disabled={refreshing} key={item.id} onPress={() => setSelected(item)} style={s.card}><View style={s.cardIdentity}>{item.counterpart_avatar?<Image source={{uri:item.counterpart_avatar}} style={s.cardAvatar}/>:<View style={s.cardAvatarFallback}><Text style={s.cardAvatarLetter}>{(item.counterpart_name||'M').slice(0,1).toUpperCase()}</Text></View>}<View style={{flex:1}}><Text style={s.cardTitle}>{item.counterpart_name||'Marketplace conversation'}</Text><Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text></View></View></Pressable>) : !listError ? <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Messages will appear here after a real marketplace interaction.</Text></View> : null}</>}</ScrollView></SafeAreaView>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},header:{padding:20,paddingBottom:8,maxWidth:760,width:'100%',alignSelf:'center'},back:{fontSize:14,fontWeight:'800',color:c.text},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:c.muted},title:{fontSize:31,fontWeight:'900',marginTop:7,color:c.text},copy:{fontSize:13,lineHeight:20,color:c.muted,marginTop:8},thread:{padding:20,paddingTop:8,paddingBottom:24,maxWidth:760,width:'100%',alignSelf:'center'},card:{backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:14,marginBottom:10},cardIdentity:{flexDirection:'row',alignItems:'center',gap:11},cardAvatar:{width:44,height:44,borderRadius:14},cardAvatarFallback:{width:44,height:44,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},cardAvatarLetter:{fontSize:16,fontWeight:'900',color:c.text},cardTitle:{fontSize:14,fontWeight:'800',color:c.text},bubble:{maxWidth:'84%',padding:13,borderRadius:16,marginBottom:9},mine:{alignSelf:'flex-end',backgroundColor:c.brand},theirs:{alignSelf:'flex-start',backgroundColor:c.surface,borderWidth:1,borderColor:c.border},body:{fontSize:14,lineHeight:20},mineBody:{color:c.onBrand},theirsBody:{color:c.text},time:{fontSize:9,color:c.muted,marginTop:5},composer:{padding:12,borderTopWidth:1,borderTopColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'flex-end',gap:8},input:{flex:1,minHeight:46,maxHeight:120,borderWidth:1,borderColor:c.border,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14,color:c.text,backgroundColor:c.input},button:{height:46,paddingHorizontal:16,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},disabled:{opacity:.5},buttonText:{color:c.onBrand,fontSize:10,fontWeight:'900'},empty:{backgroundColor:c.surface,borderRadius:19,padding:26,alignItems:'center'},emptyTitle:{fontSize:16,fontWeight:'800',color:c.text},meta:{fontSize:11,color:c.muted,marginTop:6},errorBox:{backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.danger,padding:16,marginVertical:12},error:{color:c.danger,fontSize:12,lineHeight:18},retry:{marginTop:12,alignSelf:'flex-start',borderRadius:11,borderWidth:1,borderColor:c.text,paddingHorizontal:14,paddingVertical:9},retryText:{fontSize:10,fontWeight:'900',color:c.text}});
