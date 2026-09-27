import {useEffect,useMemo,useRef} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import MapView,{Circle,Marker,type MapStyleElement,type Region} from 'react-native-maps';
import {Ionicons} from '@expo/vector-icons';
import {type LiveMapPoint} from '@/lib/everest-live';
import {useAppTheme} from '@/lib/theme';

export function LiveSearchMap({customer,businesses,radiusKm}:{customer:LiveMapPoint|null;businesses:LiveMapPoint[];radiusKm:number}){
 const {colors,isDark}=useAppTheme();const ref=useRef<MapView|null>(null);
 const region=useMemo<Region|null>(()=>{if(!customer)return null;const latDelta=Math.max(.025,(radiusKm/111)*2.6);const lonScale=Math.max(.2,Math.cos(customer.latitude*Math.PI/180));return{latitude:customer.latitude,longitude:customer.longitude,latitudeDelta:latDelta,longitudeDelta:Math.max(.025,latDelta/lonScale)}},[customer,radiusKm]);
 useEffect(()=>{if(region)ref.current?.animateToRegion(region,450)},[region]);
 if(!customer)return <View style={[s.empty,{backgroundColor:colors.soft,borderColor:colors.border}]}><Ionicons name="map-outline" size={28} color={colors.muted}/><Text style={[s.emptyText,{color:colors.muted}]}>Waiting for the confirmed service pin…</Text></View>;
 return <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={region??undefined} rotateEnabled={false} pitchEnabled={false} showsCompass={false} showsBuildings={false} showsPointsOfInterest={false} customMapStyle={isDark?darkMapStyle:undefined}>
  <Circle center={{latitude:customer.latitude,longitude:customer.longitude}} radius={Math.max(100,radiusKm*1000)} strokeWidth={1.5} strokeColor="rgba(220,190,145,.68)" fillColor="rgba(220,190,145,.08)"/>
  <Marker coordinate={{latitude:customer.latitude,longitude:customer.longitude}} anchor={{x:.5,y:.5}} tracksViewChanges={false}>
   <View style={[s.you,{backgroundColor:colors.brand,borderColor:colors.elevated}]}><Ionicons name="home" size={18} color={colors.onBrand}/></View>
  </Marker>
  {businesses.map(point=><Marker key={point.business_id??`${point.latitude}:${point.longitude}`} coordinate={{latitude:point.latitude,longitude:point.longitude}} anchor={{x:.5,y:.5}} tracksViewChanges={false}>
   <View style={[s.business,{backgroundColor:point.activity==='RESPONDED'?colors.success:point.activity==='VIEWED'?colors.brand:colors.elevated,borderColor:colors.canvas}]}>
    <Ionicons name={point.activity==='RESPONDED'?'chatbubble-ellipses':'storefront'} size={13} color={point.activity==='VIEWED'?colors.onBrand:colors.text}/>
   </View>
  </Marker>)}
 </MapView>;
}
const s=StyleSheet.create({
 empty:{...StyleSheet.absoluteFillObject,borderWidth:1,alignItems:'center',justifyContent:'center',gap:8},
 emptyText:{fontSize:11,fontWeight:'700'},
 you:{width:46,height:46,borderRadius:23,borderWidth:4,alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.24,shadowRadius:10,elevation:8},
 business:{width:32,height:32,borderRadius:16,borderWidth:3,alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.18,shadowRadius:7,elevation:5}
});
const darkMapStyle:MapStyleElement[]=[
 {elementType:'geometry',stylers:[{color:'#18221e'}]},
 {elementType:'labels.text.fill',stylers:[{color:'#aeb8b2'}]},
 {elementType:'labels.text.stroke',stylers:[{color:'#18221e'}]},
 {featureType:'administrative.locality',elementType:'labels.text.fill',stylers:[{color:'#d8be96'}]},
 {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'road',elementType:'geometry',stylers:[{color:'#2c3832'}]},
 {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#89958e'}]},
 {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#35443c'}]},
 {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'water',elementType:'geometry',stylers:[{color:'#0d1715'}]}
];
