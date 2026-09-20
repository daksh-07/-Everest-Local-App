import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getSavedItems, toggleSavedBusiness, toggleSavedProduct, type SavedBusiness, type SavedProduct } from '@/lib/marketplace';

export default function Saved() {
  const [businesses, setBusinesses] = useState<SavedBusiness[]>([]);
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await getSavedItems();
      setBusinesses(result.businesses);
      setProducts(result.products);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not load your saved items right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function removeBusiness(id: string) {
    setBusy(id); setError('');
    try { await toggleSavedBusiness(id, false); setBusinesses(items => items.filter(item => item.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this business.'); }
    finally { setBusy(''); }
  }

  async function removeProduct(id: string) {
    setBusy(id); setError('');
    try { await toggleSavedProduct(id, false); setProducts(items => items.filter(item => item.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this product.'); }
    finally { setBusy(''); }
  }

  const empty = !businesses.length && !products.length;
  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <View style={s.top}><Pressable onPress={() => router.back()} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={23} /></Pressable><Text style={s.topTitle}>Saved</Text><View style={{ width: 23 }} /></View>
      <Text style={s.intro}>Keep the local businesses and products you want to come back to.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 55 }} /> : error && empty ? <View style={s.empty}><Text style={s.emptyTitle}>{error}</Text><Pressable onPress={() => { setLoading(true); void load(); }} style={s.button}><Text style={s.buttonText}>RETRY</Text></Pressable></View> : <>
        {error ? <View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={() => void load()}><Text style={s.retry}>RETRY</Text></Pressable></View> : null}
        {businesses.length ? <><Text style={s.heading}>Businesses</Text>{businesses.map(item => <Pressable key={item.id} style={s.card} onPress={() => router.push(`/business-profile?id=${item.id}`)}><View style={s.icon}><Ionicons name="business-outline" size={22} /></View><View style={s.cardBody}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.meta}>{[item.suburb, item.city, item.state].filter(Boolean).join(', ') || 'Local business'}</Text>{item.verified && <Text style={s.verified}>✓ VERIFIED BUSINESS</Text>}</View><Pressable disabled={busy === item.id} onPress={() => void removeBusiness(item.id)} hitSlop={10} accessibilityLabel={`Remove ${item.name} from saved`}><Ionicons name="bookmark" size={20} /></Pressable></Pressable>)}</> : null}
        {products.length ? <><Text style={s.heading}>Products</Text>{products.map(item => <Pressable key={item.id} style={s.card} onPress={() => router.push(`/product?id=${item.id}`)}><View style={s.icon}><Ionicons name="cube-outline" size={22} /></View><View style={s.cardBody}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.meta}>{item.businessName || 'Local business'}</Text><Text style={s.price}>${Number(item.salePrice ?? item.price).toFixed(2)} AUD</Text></View><Pressable disabled={busy === item.id} onPress={() => void removeProduct(item.id)} hitSlop={10} accessibilityLabel={`Remove ${item.name} from saved`}><Ionicons name="bookmark" size={20} /></Pressable></Pressable>)}</> : null}
        {empty && !error ? <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="bookmark-outline" size={28} /></View><Text style={s.emptyTitle}>Nothing saved yet</Text><Text style={s.metaCenter}>Save a business or product while exploring and it will appear here.</Text><Pressable onPress={() => router.push('/')} style={s.button}><Text style={s.buttonText}>START EXPLORING</Text></Pressable></View> : null}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f8f7f4'}, page:{padding:20,paddingBottom:50}, top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, topTitle:{fontSize:17,fontWeight:'800'}, intro:{fontSize:13,lineHeight:20,color:'#666',marginTop:22}, heading:{fontSize:20,fontWeight:'800',marginTop:28,marginBottom:10}, card:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:15,marginBottom:9,flexDirection:'row',alignItems:'center'}, icon:{width:46,height:46,borderRadius:14,backgroundColor:'#eeece7',alignItems:'center',justifyContent:'center'}, cardBody:{flex:1,marginLeft:12}, cardTitle:{fontSize:14,fontWeight:'800'}, meta:{fontSize:11,lineHeight:17,color:'#777',marginTop:3}, metaCenter:{fontSize:12,lineHeight:19,color:'#777',textAlign:'center',marginTop:7}, verified:{fontSize:8,fontWeight:'900',letterSpacing:.7,marginTop:5}, price:{fontSize:11,fontWeight:'800',marginTop:5}, empty:{backgroundColor:'#fff',borderRadius:20,borderWidth:1,borderColor:'#e5e2dc',padding:28,alignItems:'center',marginTop:24}, emptyIcon:{width:58,height:58,borderRadius:18,backgroundColor:'#eeece7',alignItems:'center',justifyContent:'center'}, emptyTitle:{fontSize:17,fontWeight:'800',textAlign:'center',marginTop:14}, button:{height:46,borderRadius:13,backgroundColor:'#111',paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:16}, buttonText:{color:'#fff',fontSize:10,fontWeight:'900'}, errorBox:{backgroundColor:'#fff3f2',borderRadius:14,padding:14,marginTop:18,flexDirection:'row',alignItems:'center',gap:12}, error:{color:'#b42318',fontSize:12,flex:1}, retry:{fontSize:10,fontWeight:'900'} });
