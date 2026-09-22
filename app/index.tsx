import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CustomerTabBar } from '@/components/CustomerTabBar';
import { ui } from '@/lib/ui';

type IconName = keyof typeof Ionicons.glyphMap;
const categories: ReadonlyArray<readonly [string, IconName]> = [
  ['Car', 'car-outline'], ['Home', 'home-outline'], ['Cleaning', 'sparkles-outline'],
  ['Gardening', 'leaf-outline'], ['Tradies', 'construct-outline'], ['Beauty', 'cut-outline'],
];

export default function Home() {
  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View style={s.heading}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Local, when you need it.</Text><Text style={s.intro}>Find services, shop local products, or request quotes from verified businesses.</Text></View>
        <Pressable style={s.avatar} onPress={() => router.push('/account')} accessibilityLabel="Open account"><Ionicons name="person-outline" size={20}/></Pressable>
      </View>

      <Pressable style={s.search} onPress={() => router.push('/search')} accessibilityRole="button">
        <Ionicons name="search" size={20} color={ui.colors.muted}/><Text style={s.placeholder}>Search services, products or businesses</Text><Ionicons name="arrow-forward" size={19}/>
      </Pressable>
      <View style={s.location}><Ionicons name="location-outline" size={18}/><View style={{flex:1}}><Text style={s.label}>BROWSING AREA</Text><Text style={s.locationText}>Sydney, NSW</Text><Text style={s.areaNote}>Availability varies by suburb.</Text></View><Pressable onPress={() => router.push('/search')} accessibilityLabel="Explore Sydney"><Text style={s.change}>EXPLORE</Text></Pressable></View>

      <Text style={s.section}>Choose how to start</Text>
      <View style={s.primaryGrid}>
        <Pressable accessibilityRole="button" style={({pressed})=>[s.primary,pressed&&s.pressed]} onPress={() => router.push('/search?tab=SERVICES')}><View style={s.primaryIcon}><Ionicons name="construct-outline" size={24}/></View><Text style={s.primaryTitle}>Find a service</Text><Text style={s.primaryCopy}>Browse local professionals</Text></Pressable>
        <Pressable accessibilityRole="button" style={({pressed})=>[s.primary,pressed&&s.pressed]} onPress={() => router.push('/search?tab=PRODUCTS')}><View style={s.primaryIcon}><Ionicons name="bag-handle-outline" size={24}/></View><Text style={s.primaryTitle}>Shop local</Text><Text style={s.primaryCopy}>Products from nearby businesses</Text></Pressable>
        <Pressable accessibilityRole="button" style={({pressed})=>[s.primaryWide,pressed&&s.pressed]} onPress={() => router.push('/request')}><View style={s.primaryIcon}><Ionicons name="document-text-outline" size={24}/></View><View style={{flex:1}}><Text style={[s.primaryTitle,s.wideTitle]}>Request quotes</Text><Text style={s.primaryCopy}>Tell eligible businesses what you need</Text></View><Ionicons name="arrow-forward" size={19}/></Pressable>
      </View>

      <Text style={s.section}>Browse services</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(([name, icon]) => <Pressable key={name} accessibilityRole="button" style={({pressed})=>[s.category,pressed&&s.pressed]} onPress={() => router.push(`/search?q=${encodeURIComponent(name)}&tab=SERVICES`)}><View style={s.categoryIcon}><Ionicons name={icon} size={23}/></View><Text style={s.categoryText}>{name}</Text></Pressable>)}</ScrollView>

      <Pressable accessibilityRole="button" style={({pressed})=>[s.hero,pressed&&s.pressed]} onPress={() => router.push('/assistant')}>
        <View style={s.aiIcon}><Ionicons name="sparkles" size={19} color="#fff"/></View>
        <View style={{flex:1}}><Text style={s.heroTitle}>Not sure where to start?</Text><Text style={s.heroCopy}>Ask Everest to guide you through real marketplace options.</Text></View>
        <Ionicons name="arrow-forward" color="#fff" size={18}/>
      </Pressable>

      <Text style={s.section}>Your activity</Text>
      <View style={s.grid}>
        <Pressable style={s.activity} onPress={() => router.push('/activity')}><Ionicons name="pulse-outline" size={21}/><Text style={s.activityText}>Activity</Text></Pressable>
        <Pressable style={s.activity} onPress={() => router.push('/messages')}><Ionicons name="chatbubble-outline" size={21}/><Text style={s.activityText}>Messages</Text></Pressable>
        <Pressable style={s.activity} onPress={() => router.push('/orders')}><Ionicons name="cube-outline" size={21}/><Text style={s.activityText}>Orders</Text></Pressable>
        <Pressable style={s.activity} onPress={() => router.push('/cart')}><Ionicons name="bag-outline" size={21}/><Text style={s.activityText}>Cart</Text></Pressable>
      </View>
      <View style={{height:86}}/>
    </ScrollView>
    <CustomerTabBar active="/"/>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:ui.colors.canvas},page:{padding:20,width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,gap:16},heading:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:ui.colors.muted},title:{fontSize:32,lineHeight:37,fontWeight:'900',letterSpacing:-1.2,marginTop:5,color:ui.colors.ink},intro:{fontSize:13,lineHeight:20,color:ui.colors.muted,marginTop:7,maxWidth:470},avatar:{width:44,height:44,borderRadius:22,backgroundColor:ui.colors.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:ui.colors.line},search:{minHeight:56,borderRadius:ui.radius.md,backgroundColor:ui.colors.surface,borderWidth:1,borderColor:ui.colors.line,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10},placeholder:{flex:1,fontSize:15,color:ui.colors.muted},location:{marginTop:11,padding:14,borderRadius:ui.radius.md,backgroundColor:ui.colors.soft,flexDirection:'row',alignItems:'center',gap:10},label:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#7f7b74'},locationText:{fontSize:14,fontWeight:'800',marginTop:2,color:ui.colors.ink},areaNote:{fontSize:10,lineHeight:15,color:ui.colors.muted,marginTop:2},change:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:ui.colors.ink},section:{fontSize:19,fontWeight:'900',marginTop:27,marginBottom:12,color:ui.colors.ink},primaryGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},primary:{width:'48%',minHeight:150,backgroundColor:ui.colors.surface,borderRadius:ui.radius.lg,borderWidth:1,borderColor:ui.colors.line,padding:16},primaryWide:{width:'100%',minHeight:82,backgroundColor:ui.colors.surface,borderRadius:ui.radius.lg,borderWidth:1,borderColor:ui.colors.line,padding:15,flexDirection:'row',alignItems:'center',gap:12},primaryIcon:{width:46,height:46,borderRadius:14,backgroundColor:ui.colors.soft,alignItems:'center',justifyContent:'center'},primaryTitle:{fontSize:15,fontWeight:'900',marginTop:12,color:ui.colors.ink},wideTitle:{marginTop:0},primaryCopy:{fontSize:11,color:ui.colors.muted,lineHeight:17,marginTop:4},pressed:{opacity:.66,transform:[{scale:.99}]},hero:{marginTop:24,borderRadius:ui.radius.lg,backgroundColor:ui.colors.ink,padding:16,flexDirection:'row',alignItems:'center',gap:12},aiIcon:{width:42,height:42,borderRadius:13,backgroundColor:'#2c2c2a',alignItems:'center',justifyContent:'center'},heroTitle:{color:'#fff',fontSize:14,fontWeight:'900'},heroCopy:{color:'#bbb7b0',fontSize:11,lineHeight:17,marginTop:3},categoryRow:{gap:12,paddingRight:8},category:{width:72,alignItems:'center'},categoryIcon:{width:62,height:62,borderRadius:19,backgroundColor:ui.colors.surface,borderWidth:1,borderColor:ui.colors.line,alignItems:'center',justifyContent:'center'},categoryText:{fontSize:11,fontWeight:'800',marginTop:8,color:ui.colors.ink},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},activity:{width:'48%',minHeight:68,backgroundColor:ui.colors.surface,borderRadius:ui.radius.md,borderWidth:1,borderColor:ui.colors.line,padding:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},activityText:{fontSize:13,fontWeight:'800',color:ui.colors.ink}
});
