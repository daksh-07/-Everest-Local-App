import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversations, markMessageRead, messages, sendMessage } from '@/lib/messaging';
import { currentUser } from '@/lib/marketplace';

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

  if (selected) return <SafeAreaView style={s.safe}><View style={s.header}><Pressable onPress={() => { setSelected(null); router.replace('/messages'); }}><Text style={s.back}>‹ Messages</Text></Pressable><Text style={s.title}>Conversation</Text><Text style={s.copy}>Only authorized marketplace participants can read or send messages.</Text></View><ScrollView contentContainerStyle={s.thread}>{threadLoading ? <ActivityIndicator/> : thread.length ? thread.map(message => <View key={message.id} style={[s.bubble, message.sender_id === userId ? s.mine : s.theirs]}><Text style={[s.body, message.sender_id === userId ? s.mineBody : s.theirsBody]}>{message.body}</Text><Text style={s.time}>{new Date(message.created_at).toLocaleString()}</Text></View>) : <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Send a message to start the conversation.</Text></View>}{!!error && <Text style={s.error}>{error}</Text>}</ScrollView><View style={s.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" multiline maxLength={5000} style={s.input}/><Pressable disabled={busy || !draft.trim()} onPress={() => void submit()} style={s.button}><Text style={s.buttonText}>{busy ? 'SENDING…' : 'SEND'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Messages</Text><Text style={s.copy}>Conversations are only visible to their authorized participants.</Text>{loading ? <ActivityIndicator/> : error ? <Text style={s.error}>{error}</Text> : items.length ? items.map(item => <Pressable key={item.id} onPress={() => setSelected(item)} style={s.card}><Text style={s.cardTitle}>Marketplace conversation</Text><Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text></Pressable>) : <View style={s.empty}><Text style={s.emptyTitle}>No messages yet.</Text><Text style={s.meta}>Messages will appear here after a real marketplace interaction.</Text></View>}</ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},header:{padding:20,paddingBottom:8},back:{fontSize:14,fontWeight:'800'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:31,fontWeight:'900',marginTop:7},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:8},thread:{padding:20,paddingTop:8,paddingBottom:24},card:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:17,marginBottom:10},cardTitle:{fontSize:14,fontWeight:'800'},bubble:{maxWidth:'84%',padding:13,borderRadius:16,marginBottom:9},mine:{alignSelf:'flex-end',backgroundColor:'#111'},theirs:{alignSelf:'flex-start',backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc'},body:{fontSize:14,lineHeight:20},mineBody:{color:'#fff'},theirsBody:{color:'#111'},time:{fontSize:9,color:'#777',marginTop:5},composer:{padding:12,borderTopWidth:1,borderTopColor:'#e5e2dc',backgroundColor:'#fff',flexDirection:'row',alignItems:'flex-end',gap:8},input:{flex:1,minHeight:46,maxHeight:120,borderWidth:1,borderColor:'#dfdcd5',borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14},button:{height:46,paddingHorizontal:16,borderRadius:13,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontSize:10,fontWeight:'900'},empty:{backgroundColor:'#fff',borderRadius:19,padding:26,alignItems:'center'},emptyTitle:{fontSize:16,fontWeight:'800'},meta:{fontSize:11,color:'#777',marginTop:6},error:{color:'#b42318',fontSize:12,marginTop:12}});