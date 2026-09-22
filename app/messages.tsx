import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversations, markMessageRead, messages, sendMessage } from '@/lib/messaging';
import { currentUser } from '@/lib/marketplace';
import { CustomerTabBar } from '@/components/CustomerTabBar';
import { LoadingList } from '@/components/LoadingList';
import { ui } from '@/lib/ui';

type Message = { id: string; sender_id: string; body: string; read_at: string | null; created_at: string };
type ConversationItem = { id: string; customer_id: string; business_id: string; request_id: string | null; booking_id: string | null; quote_id: string | null; created_at: string };

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
      setItems(data as ConversationItem[]);
      setUserId(user?.id ?? '');
      if (requestedId) {
        const found = (data as ConversationItem[]).find(item => item.id === requestedId);
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

  if (selected) return <SafeAreaView style={s.safe}><View style={s.header}><Pressable onPress={() => { setSelected(null); router.replace('/messages'); }}><Text style={s.back}>‹ Messages</Text></Pressable><Text style={s.title}>Conversation</Text><Text style={s.copy}>Only authorized marketplace participants can read or send messages.</Text></View><ScrollView contentContainerStyle={s.thread}>{threadLoading ? <ActivityIndicator/> : thread.length ? thread.map(message => <View key={message.id} style={[s.bubble, message.sender_id === userId ? s.mine : s.theirs]}><Text style={[s.body, message.sender_id === userId ? s.mineBody : s.theirsBody]}>{message.body}</Text><Text style={s.time}>{new Date(message.created_at).toLocaleString()}</Text></View>) : <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Send a message to start the conversation.</Text></View>}{!!error && <View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={() => void loadThread(selected.id)} disabled={threadLoading} style={s.retry}><Text style={s.retryText}>{threadLoading ? 'RETRYING…' : 'RETRY'}</Text></Pressable></View>}</ScrollView><View style={s.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" multiline maxLength={5000} style={s.input}/><Pressable disabled={busy || !draft.trim()} onPress={() => void submit()} style={s.button}><Text style={s.buttonText}>{busy ? 'SENDING…' : 'SEND'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Messages</Text><Text style={s.copy}>Keep in touch with businesses about active requests, bookings and orders.</Text>{loading ? <LoadingList rows={3}/> : error ? <View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={() => void loadList()} disabled={loading} style={s.retry}><Text style={s.retryText}>{loading ? 'RETRYING…' : 'RETRY'}</Text></Pressable></View> : items.length ? items.map(item => <Pressable key={item.id} onPress={() => setSelected(item)} style={({pressed})=>[s.card,pressed&&s.pressed]}><Text style={s.cardTitle}>Marketplace conversation</Text><Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text></Pressable>) : <View style={s.empty}><Text style={s.emptyTitle}>No conversations yet</Text><Text style={s.meta}>When you contact a business about a request, booking or order, the conversation will appear here.</Text><Pressable onPress={()=>router.push('/search')} style={s.explore}><Text style={s.exploreText}>EXPLORE LOCAL</Text></Pressable></View>}</ScrollView><CustomerTabBar active="/messages" /></SafeAreaView>;
}

const s = StyleSheet.create({safe:{flex:1,backgroundColor:ui.colors.canvas},page:{width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center',padding:20,paddingBottom:112},header:{padding:20,paddingBottom:8},back:{fontSize:14,fontWeight:'800'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:ui.colors.muted},title:{fontSize:31,fontWeight:'900',marginTop:7},copy:{fontSize:13,lineHeight:20,color:ui.colors.muted,marginTop:8,marginBottom:22},thread:{padding:20,paddingTop:8,paddingBottom:24},card:{backgroundColor:'#fff',borderRadius:ui.radius.md,borderWidth:1,borderColor:ui.colors.line,padding:17,marginBottom:10},pressed:{opacity:.72},cardTitle:{fontSize:14,fontWeight:'800'},bubble:{maxWidth:'84%',padding:13,borderRadius:16,marginBottom:9},mine:{alignSelf:'flex-end',backgroundColor:ui.colors.ink},theirs:{alignSelf:'flex-start',backgroundColor:'#fff',borderWidth:1,borderColor:ui.colors.line},body:{fontSize:14,lineHeight:20},mineBody:{color:'#fff'},theirsBody:{color:ui.colors.ink},time:{fontSize:9,color:ui.colors.muted,marginTop:5},composer:{padding:12,borderTopWidth:1,borderTopColor:ui.colors.line,backgroundColor:'#fff',flexDirection:'row',alignItems:'flex-end',gap:8},input:{flex:1,minHeight:46,maxHeight:120,borderWidth:1,borderColor:'#dfdcd5',borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:16},button:{height:46,paddingHorizontal:16,borderRadius:13,backgroundColor:ui.colors.ink,alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontSize:10,fontWeight:'900'},empty:{backgroundColor:'#fff',borderRadius:ui.radius.lg,padding:26,alignItems:'center',borderWidth:1,borderColor:ui.colors.line},emptyTitle:{fontSize:16,fontWeight:'800'},meta:{fontSize:12,lineHeight:18,color:ui.colors.muted,marginTop:6,textAlign:'center'},explore:{minHeight:44,justifyContent:'center',marginTop:14,paddingHorizontal:16,borderRadius:12,backgroundColor:ui.colors.ink},exploreText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.7},errorBox:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#f0c8c4',padding:16,marginTop:12},error:{color:ui.colors.danger,fontSize:12,lineHeight:18},retry:{marginTop:12,alignSelf:'flex-start',borderRadius:11,borderWidth:1,borderColor:ui.colors.ink,paddingHorizontal:14,paddingVertical:9},retryText:{fontSize:10,fontWeight:'900'}});
