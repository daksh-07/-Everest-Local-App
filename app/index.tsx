import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CustomerTabBar } from '@/components/CustomerTabBar';
import { ui } from '@/lib/ui';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const categories: ReadonlyArray<readonly [string, IconName]> = [
  ['Car', 'car-outline'], ['Home', 'home-outline'], ['Cleaning', 'sparkles-outline'],
  ['Gardening', 'leaf-outline'], ['Tradies', 'construct-outline'], ['Beauty', 'cut-outline'],
];

export default function Home() {
  const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
  const [avatarUrl,setAvatarUrl]=useState<string|null>(null);
  useEffect(()=>{let active=true;void (async()=>{try{const {supabase,supabaseConfigured}=await import('@/lib/supabase');if(!supabaseConfigured)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from('profiles').select('avatar_url').eq('id',user.id).maybeSingle();if(active)setAvatarUrl(data?.avatar_url??null)}catch{if(active)setAvatarUrl(null)}})();return()=>{active=false}},[]);
  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View style={s.heading}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Local, when you need it.</Text><Text style={s.intro}>Find services, shop local products, or request quotes from verified businesses.</Text></View>
        <Pressable style={s.avatar} onPress={() => router.push('/account')} accessibilityLabel="Open account">{avatarUrl?<Image source={{uri:avatarUrl}} style={s.avatarImage}/>:<Ionicons name="person-outline" size={20} color={colors.text}/>}</Pressable>
      </View>

      <Pressable style={s.search} onPress={() => router.push('/search')} accessibilityRole="button">
        <Ionicons name="search" size={20} color={colors.muted}/><Text style={s.placeholder}>Search services, products or businesses</Text><Ionicons name="arrow-forward" size={19} color={colors.text}/>
      </Pressable>
      <View style={s.location}><Ionicons name="location-outline" size={18} color={colors.text}/><View style={{flex:1}}><Text style={s.label}>BROWSING AREA</Text><Text style={s.locationText}>Sydney, NSW</Text><Text style={s.areaNote}>Availability varies by suburb.</Text></View><Pressable onPress={() => router.push('/search')} accessibilityLabel="Explore Sydney"><Text style={s.change}>EXPLORE</Text></Pressable></View>

      <Text style={s.section}>Choose how to start</Text>
      <View style={s.primaryGrid}>
        <Pressable accessibilityRole="button" style={({pressed})=>[s.primary,pressed&&s.pressed]} onPress={() => router.push('/search?tab=SERVICES')}><View style={s.primaryIcon}><Ionicons name="construct-outline" size={24} color={colors.brand}/></View><Text style={s.primaryTitle}>Find a service</Text><Text style={s.primaryCopy}>Browse local professionals</Text></Pressable>
        <Pressable accessibilityRole="button" style={({pressed})=>[s.primary,pressed&&s.pressed]} onPress={() => router.push('/search?tab=PRODUCTS')}><View style={s.primaryIcon}><Ionicons name="bag-handle-outline" size={24} color={colors.brand}/></View><Text style={s.primaryTitle}>Shop local</Text><Text style={s.primaryCopy}>Products from nearby businesses</Text></Pressable>
        <Pressable accessibilityRole="button" style={({pressed})=>[s.primaryWide,pressed&&s.pressed]} onPress={() => router.push('/request')}><View style={s.primaryIcon}><Ionicons name="document-text-outline" size={24} color={colors.brand}/></View><View style={{flex:1}}><Text style={[s.primaryTitle,s.wideTitle]}>Request quotes</Text><Text style={s.primaryCopy}>Tell eligible businesses what you need</Text></View><Ionicons name="arrow-forward" size={19} color={colors.muted}/></Pressable>
      </View>

      <Text style={s.section}>Browse services</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(([name, icon]) => <Pressable key={name} accessibilityRole="button" style={({pressed})=>[s.category,pressed&&s.pressed]} onPress={() => router.push(`/search?q=${encodeURIComponent(name)}&tab=SERVICES`)}><View style={s.categoryIcon}><Ionicons name={icon} size={23} color={colors.brand}/></View><Text style={s.categoryText}>{name}</Text></Pressable>)}</ScrollView>

      <Text style={s.section}>Your activity</Text>
      <View style={s.grid}>
        <Pressable style={({pressed})=>[s.activity,pressed&&s.pressed]} onPress={() => router.push('/activity')}><Ionicons name="pulse-outline" size={21} color={colors.brand}/><Text style={s.activityText}>Activity</Text></Pressable>
        <Pressable style={({pressed})=>[s.activity,pressed&&s.pressed]} onPress={() => router.push('/messages')}><Ionicons name="chatbubble-outline" size={21} color={colors.brand}/><Text style={s.activityText}>Messages</Text></Pressable>
        <Pressable style={({pressed})=>[s.activity,pressed&&s.pressed]} onPress={() => router.push('/orders')}><Ionicons name="cube-outline" size={21} color={colors.brand}/><Text style={s.activityText}>Orders</Text></Pressable>
        <Pressable style={({pressed})=>[s.activity,pressed&&s.pressed]} onPress={() => router.push('/cart')}><Ionicons name="bag-outline" size={21} color={colors.brand}/><Text style={s.activityText}>Cart</Text></Pressable>
      </View>
      <View style={{height:24}}/>
    </ScrollView>
    <CustomerTabBar active="/"/>
  </SafeAreaView>;
}

const createStyles = (c:ThemeColors) => StyleSheet.create({
  safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:112,width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,gap:14},heading:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:c.muted},title:{fontSize:29,lineHeight:34,fontWeight:'900',letterSpacing:-1,marginTop:5,color:c.text},intro:{fontSize:12,lineHeight:18,color:c.muted,marginTop:6,maxWidth:470},avatar:{width:44,height:44,borderRadius:22,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.border,overflow:'hidden'},avatarImage:{width:44,height:44,borderRadius:22},search:{minHeight:54,borderRadius:ui.radius.md,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:10},placeholder:{flex:1,fontSize:14,color:c.muted},location:{marginTop:10,padding:13,borderRadius:ui.radius.md,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:10},label:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:c.muted},locationText:{fontSize:14,fontWeight:'800',marginTop:2,color:c.text},areaNote:{fontSize:10,lineHeight:15,color:c.muted,marginTop:2},change:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:c.text},section:{fontSize:18,fontWeight:'900',marginTop:26,marginBottom:12,color:c.text},primaryGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},primary:{width:'48%',minHeight:130,backgroundColor:c.surface,borderRadius:20,borderWidth:1,borderColor:c.border,padding:16},primaryWide:{width:'100%',minHeight:72,backgroundColor:c.elevated,borderRadius:20,borderWidth:1,borderColor:c.border,padding:15,flexDirection:'row',alignItems:'center',gap:11},primaryIcon:{width:42,height:42,borderRadius:13,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},primaryTitle:{fontSize:14,fontWeight:'900',marginTop:10,color:c.text},wideTitle:{marginTop:0},primaryCopy:{fontSize:11,color:c.textSecondary,lineHeight:16,marginTop:4},pressed:{opacity:.66,transform:[{scale:.99}]},categoryRow:{gap:10,paddingRight:8},category:{width:68,alignItems:'center'},categoryIcon:{width:58,height:58,borderRadius:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},categoryText:{fontSize:11,fontWeight:'800',marginTop:7,color:c.text},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},activity:{width:'48%',minHeight:66,backgroundColor:c.surface,borderRadius:ui.radius.md,borderWidth:1,borderColor:c.border,padding:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},activityText:{fontSize:13,fontWeight:'800',color:c.text}
});
