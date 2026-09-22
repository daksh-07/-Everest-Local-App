import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversations, markMessageRead, messages, sendMessage } from '@/lib/messaging';
import { currentUser } from '@/lib/marketplace';

type Message = { id: string; sender_id: string; body: string; read_at: string | null; created_at: string };
type ConversationItem = { id: string; customer_id: string; business_id: string; request_id: string | null; booking_id: string | null; quote_id: string | null; created_at: string; counterpart_name?: string; counterpart_avatar?: string | null };

export default function Messages() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const requestedId = typeof params.conversationId === 'string' ? params.conversationId : '';
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [selected, setSelected] = useState<ConversationItem | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [data, user] = await Promise.all([conversations(), currentUser()]);
      const raw = data as ConversationItem[];
      const businessIds = [...new Set(raw.map(item => item.business_id))];
      const customerIds = [...new Set(raw.map(item => item.customer_id))];
      const [{ data: businessRows, error: businessError }, { data: profileRows, error: profileError }] = await Promise.all([
        businessIds.length ? (await import('@/lib/supabase')).supabase.from('businesses').select('id,name,logo_url').in('id', businessIds) : Promise.resolve({data:[],error:null}),
        customerIds.length ? (await import('@/lib/supabase')).supabase.from('public_profiles').select('id,display_name,avatar_url').in('id', customerIds).eq('visibility','PUBLIC') : Promise.resolve({data:[],error:null}),
      ]);
      if (businessError) throw businessError;
      if (profileError) throw profileError;
      const businessMap = Object.fromEntries((businessRows ?? []).map(item => [item.id, item]));
      const profileMap = Object.fromEntries((profileRows ?? []).map(item => [item.id, item]));
      const currentId = user?.id ?? '';
      const enriched = raw.map(item => {
        const counterpart = item.customer_id === currentId ? businessMap[item.business_id] : profileMap[item.customer_id];
        return {...item,counterpart_name:counterpart?.name ?? counterpart?.display_name ?? 'Marketplace member',counterpart_avatar:counterpart?.logo_url ?? counterpart?.avatar_url ?? null};
      });
      setItems(enriched);
      setUserId(currentId);
      if (requestedId) {
        const found = enriched.find(item => item.id === requestedId);
        if (found) setSelected(found);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load messages.');
    } finally { setLoading(false); }
  }, [requestedId]);

  const loadThread = useCallback(async (id: string) => {
    setThreadLoading(true); setError('');
    try {
      const data = await messages(id);
      setThread(data as Message[]);
      for (const message of data as Message[]) {
        if (!message.read_at && message.sender_id !== userId) await markMessageRead(message.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load conversation.');
    } finally { setThreadLoading(false); }
  }, [userId]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selected) void loadThread(selected.id); }, [selected, loadThread]);

  async function submit() {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try { await sendMessage(selected.id, draft); setDraft(''); await loadThread(selected.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Message could not be sent.'); }
    finally { setBusy(false); }
  }

  if (selected) return <SafeAreaView style={s.safe}><View style={s.header}><Pressable onPress={() => { setSelected(null); router.replace('/messages'); }}><Text style={s.back}>‹ Messages</Text></Pressable><Text style={s.title}>{selected.counterpart_name||'Conversation'}</Text><Text style={s.copy}>Only authorized marketplace participants can read or send messages.</Text></View><ScrollView contentContainerStyle={s.thread}>{threadLoading ? <ActivityIndicator/> : thread.length ? thread.map(message => <View key={message.id} style={[s.bubble, message.sender_id === userId ? s.mine : s.theirs]}><Text style={[s.body, message.sender_id === userId ? s.mineBody : s.theirsBody]}>{message.body}</Text><Text style={s.time}>{new Date(message.created_at).toLocaleString()}</Text></View>) : <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Send a message to start the conversation.</Text></View>}{!!error && <View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={() => void loadThread(selected.id)} disabled={threadLoading} style={s.retry}><Text style={s.retryText}>{threadLoading ? 'RETRYING…' : 'RETRY'}</Text></Pressable></View>}</ScrollView><View style={s.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" multiline maxLength={5000} style={s.input}/><Pressable disabled={busy || !draft.trim()} onPress={() => void submit()} style={s.button}><Text style={s.buttonText}>{busy ? 'SENDING…' : 'SEND'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Messages</Text><Text style={s.copy}>Conversations are only visible to their authorized participants.</Text>{loading ? <ActivityIndicator/> : error ? <View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={() => void loadList()} disabled={loading} style={s.retry}><Text style={s.retryText}>{loading ? 'RETRYING…' : 'RETRY'}</Text></Pressable></View> : items.length ? items.map(item => <Pressable key={item.id} onPress={() => setSelected(item)} style={s.card}><View style={s.cardIdentity}>{item.counterpart_avatar?<Image source={{uri:item.counterpart_avatar}} style={s.cardAvatar}/>:<View style={s.cardAvatarFallback}><Text style={s.cardAvatarLetter}>{(item.counterpart_name||'M').slice(0,1).toUpperCase()}</Text></View>}<View style={{flex:1}}><Text style={s.cardTitle}>{item.counterpart_name||'Marketplace conversation'}</Text><Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text></View></View></Pressable>) : <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Messages will appear here after a real marketplace interaction.</Text></View>}</ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},header:{padding:20,paddingBottom:8},back:{fontSize:14,fontWeight:'800'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:31,fontWeight:'900',marginTop:7},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:8},thread:{padding:20,paddingTop:8,paddingBottom:24},card:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:14,marginBottom:10},cardIdentity:{flexDirection:'row',alignItems:'center',gap:11},cardAvatar:{width:44,height:44,borderRadius:14},cardAvatarFallback:{width:44,height:44,borderRadius:14,backgroundColor:'#f0eee9',alignItems:'center',justifyContent:'center'},cardAvatarLetter:{fontSize:16,fontWeight:'900'},cardTitle:{fontSize:14,fontWeight:'800'},bubble:{maxWidth:'84%',padding:13,borderRadius:16,marginBottom:9},mine:{alignSelf:'flex-end',backgroundColor:'#111'},theirs:{alignSelf:'flex-start',backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc'},body:{fontSize:14,lineHeight:20},mineBody:{color:'#fff'},theirsBody:{color:'#111'},time:{fontSize:9,color:'#777',marginTop:5},composer:{padding:12,borderTopWidth:1,borderTopColor:'#e5e2dc',backgroundColor:'#fff',flexDirection:'row',alignItems:'flex-end',gap:8},input:{flex:1,minHeight:46,maxHeight:120,borderWidth:1,borderColor:'#dfdcd5',borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14},button:{height:46,paddingHorizontal:16,borderRadius:13,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontSize:10,fontWeight:'900'},empty:{backgroundColor:'#fff',borderRadius:19,padding:26,alignItems:'center'},emptyTitle:{fontSize:16,fontWeight:'800'},meta:{fontSize:11,color:'#777',marginTop:6},errorBox:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#f0c8c4',padding:16,marginTop:12},error:{color:'#b42318',fontSize:12,lineHeight:18},retry:{marginTop:12,alignSelf:'flex-start',borderRadius:11,borderWidth:1,borderColor:'#111',paddingHorizontal:14,paddingVertical:9},retryText:{fontSize:10,fontWeight:'900'}});
