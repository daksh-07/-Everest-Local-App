import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

type IconName = keyof typeof Ionicons.glyphMap;
const categories: ReadonlyArray<readonly [string, IconName]> = [
  ['Car', 'car-outline'], ['Home', 'home-outline'], ['Cleaning', 'sparkles-outline'],
  ['Gardening', 'leaf-outline'], ['Tradies', 'construct-outline'], ['Beauty', 'cut-outline'],
];

export default function Home() {
  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>What do you need?</Text></View>
        <Pressable style={s.avatar} onPress={() => router.push('/account')} accessibilityLabel="Open account"><Ionicons name="person-outline" size={20}/></Pressable>
      </View>

      <Pressable style={s.search} onPress={() => router.push('/search')} accessibilityRole="button">
        <Ionicons name="search" size={20} color="#777"/><Text style={s.placeholder}>Search anything local</Text><Ionicons name="options-outline" size={20}/>
      </Pressable>
      <View style={s.location}><Ionicons name="location-outline" size={18}/><View style={{flex:1}}><Text style={s.label}>YOUR AREA</Text><Text style={s.locationText}>Sydney, NSW</Text></View><Pressable onPress={() => router.push('/search')} accessibilityLabel="Change area"><Text style={s.change}>CHANGE</Text></Pressable></View>

      <Text style={s.section}>Start here</Text>
      <View style={s.primaryGrid}>
        <Pressable style={s.primary} onPress={() => router.push('/search?tab=SERVICES')}><View style={s.primaryIcon}><Ionicons name="construct-outline" size={25}/></View><Text style={s.primaryTitle}>Hire a service</Text><Text style={s.primaryCopy}>Find a local business</Text></Pressable>
        <Pressable style={s.primary} onPress={() => router.push('/search?tab=PRODUCTS')}><View style={s.primaryIcon}><Ionicons name="bag-handle-outline" size={25}/></View><Text style={s.primaryTitle}>Buy a product</Text><Text style={s.primaryCopy}>Shop from local businesses</Text></Pressable>
        <Pressable style={s.primaryWide} onPress={() => router.push('/request')}><View style={s.primaryIcon}><Ionicons name="add-circle-outline" size={25}/></View><View style={{flex:1}}><Text style={s.primaryTitle}>Post a job / request</Text><Text style={s.primaryCopy}>Tell businesses what you need</Text></View><Ionicons name="arrow-forward" size={19}/></Pressable>
      </View>

      <Pressable style={s.hero} onPress={() => router.push('/assistant')}>
        <View style={s.aiIcon}><Ionicons name="sparkles" size={20} color="#fff"/></View>
        <View style={{flex:1}}><Text style={s.heroTitle}>Ask Everest</Text><Text style={s.heroCopy}>Describe what you need and let Everest guide you using real marketplace data.</Text></View>
        <Ionicons name="arrow-forward" color="#fff" size={18}/>
      </Pressable>

      <Text style={s.section}>Browse services</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12}}>{categories.map(([name, icon]) => <Pressable key={name} style={s.category} onPress={() => router.push('/search')}><View style={s.categoryIcon}><Ionicons name={icon} size={23}/></View><Text style={s.categoryText}>{name}</Text></Pressable>)}</ScrollView>

      <Text style={s.section}>Your activity</Text>
      <View style={s.grid}>
        <Pressable style={s.activity} onPress={() => router.push('/activity')}><Ionicons name="pulse-outline" size={21}/><Text style={s.activityText}>Activity</Text></Pressable>
        <Pressable style={s.activity} onPress={() => router.push('/messages')}><Ionicons name="chatbubble-outline" size={21}/><Text style={s.activityText}>Messages</Text></Pressable>
        <Pressable style={s.activity} onPress={() => router.push('/orders')}><Ionicons name="cube-outline" size={21}/><Text style={s.activityText}>Orders</Text></Pressable>
        <Pressable style={s.activity} onPress={() => router.push('/cart')}><Ionicons name="bag-outline" size={21}/><Text style={s.activityText}>Cart</Text></Pressable>
      </View>
      <View style={{height:110}}/>
    </ScrollView>

    <View style={s.nav}>
      <Nav icon="home" label="Home" active/>
      <Nav icon="search-outline" label="Explore" onPress={() => router.push('/search')}/>
      <Nav icon="pulse-outline" label="Activity" onPress={() => router.push('/activity')}/>
      <Nav icon="chatbubble-outline" label="Messages" onPress={() => router.push('/messages')}/>
      <Nav icon="person-outline" label="Account" onPress={() => router.push('/account')}/>
    </View>
  </SafeAreaView>;
}

function Nav({ icon, label, active, onPress }: { icon: IconName; label: string; active?: boolean; onPress?: () => void }) {
  return <Pressable style={s.navItem} onPress={onPress} accessibilityRole="button"><Ionicons name={icon} size={21} color={active ? '#111' : '#999'}/><Text style={[s.navText, active && {color:'#111'}]}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:2,color:'#777'},title:{fontSize:30,fontWeight:'800',letterSpacing:-1,marginTop:5},avatar:{width:44,height:44,borderRadius:22,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#e5e2dc'},search:{height:58,borderRadius:17,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10},placeholder:{flex:1,fontSize:14,color:'#777'},location:{marginTop:12,padding:14,borderRadius:15,backgroundColor:'#f0eee9',flexDirection:'row',alignItems:'center',gap:10},label:{fontSize:9,fontWeight:'800',letterSpacing:1.2,color:'#888'},locationText:{fontSize:14,fontWeight:'700',marginTop:2},change:{fontSize:9,fontWeight:'900',letterSpacing:.7},section:{fontSize:19,fontWeight:'800',marginTop:28,marginBottom:13},primaryGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},primary:{width:'48%',minHeight:155,backgroundColor:'#fff',borderRadius:19,borderWidth:1,borderColor:'#e5e2dc',padding:17},primaryWide:{width:'100%',minHeight:82,backgroundColor:'#fff',borderRadius:19,borderWidth:1,borderColor:'#e5e2dc',padding:15,flexDirection:'row',alignItems:'center',gap:12},primaryIcon:{width:48,height:48,borderRadius:15,backgroundColor:'#f0eee9',alignItems:'center',justifyContent:'center'},primaryTitle:{fontSize:15,fontWeight:'800',marginTop:12},primaryCopy:{fontSize:11,color:'#777',lineHeight:17,marginTop:4},hero:{marginTop:18,borderRadius:21,backgroundColor:'#151515',padding:16,flexDirection:'row',alignItems:'center',gap:12},aiIcon:{width:44,height:44,borderRadius:14,backgroundColor:'#292929',alignItems:'center',justifyContent:'center'},heroTitle:{color:'#fff',fontSize:15,fontWeight:'800'},heroCopy:{color:'#aaa',fontSize:11,lineHeight:17,marginTop:3},category:{width:74,alignItems:'center'},categoryIcon:{width:64,height:64,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',alignItems:'center',justifyContent:'center'},categoryText:{fontSize:11,fontWeight:'700',marginTop:8},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},activity:{width:'48%',minHeight:68,backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#e5e2dc',padding:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},activityText:{fontSize:13,fontWeight:'700'},nav:{position:'absolute',bottom:0,left:0,right:0,height:82,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#e5e2dc',flexDirection:'row',justifyContent:'space-around',paddingTop:10},navItem:{alignItems:'center',width:64},navText:{fontSize:10,color:'#999',marginTop:5,fontWeight:'700'}
});
