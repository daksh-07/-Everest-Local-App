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
 return <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={region??undefined} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false} showsCompass={false} showsBuildings showsTraffic={false} showsPointsOfInterest={false} customMapStyle={isDark?darkMapStyle:premiumLightMapStyle}>
  <Circle center={{latitude:customer.latitude,longitude:customer.longitude}} radius={Math.max(100,radiusKm*1000)} strokeWidth={1.4} strokeColor="rgba(117,237,189,.58)" fillColor="rgba(70,202,150,.035)"/>
  <Circle center={{latitude:customer.latitude,longitude:customer.longitude}} radius={Math.max(80,radiusKm*500)} strokeWidth={1} strokeColor="rgba(117,237,189,.28)" fillColor="rgba(70,202,150,.025)"/>
  <Marker coordinate={{latitude:customer.latitude,longitude:customer.longitude}} anchor={{x:.5,y:.5}} tracksViewChanges={false}>
   <View style={s.youOuter}><View style={s.youInner}><Ionicons name="navigate" size={17} color="#07110d"/></View></View>
  </Marker>
  {businesses.map(point=>{const responded=point.activity==='RESPONDED';const viewed=point.activity==='VIEWED';const tone=responded?colors.success:viewed?colors.accent:'rgba(224,233,228,.78)';return <Marker key={point.business_id??`${point.latitude}:${point.longitude}`} coordinate={{latitude:point.latitude,longitude:point.longitude}} anchor={{x:.5,y:.5}} tracksViewChanges={false}>
   <View style={[s.businessOuter,{borderColor:tone}]}><View style={[s.businessInner,{backgroundColor:responded?'rgba(74,214,157,.22)':viewed?'rgba(220,190,145,.18)':'rgba(12,20,17,.92)'}]}><Ionicons name={responded?'chatbubble-ellipses':'storefront'} size={12} color={tone}/></View></View>
  </Marker>})}
 </MapView>;
}
const s=StyleSheet.create({
 empty:{...StyleSheet.absoluteFillObject,borderWidth:1,alignItems:'center',justifyContent:'center',gap:8},
 emptyText:{fontSize:11,fontWeight:'700'},
 youOuter:{width:48,height:48,borderRadius:24,borderWidth:1.5,borderColor:'rgba(147,255,211,.88)',backgroundColor:'rgba(6,17,13,.9)',alignItems:'center',justifyContent:'center',shadowColor:'#6ff0b9',shadowOpacity:.65,shadowRadius:14,elevation:10},
 youInner:{width:29,height:29,borderRadius:15,backgroundColor:'#a9f3d2',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.72)'},
 businessOuter:{width:34,height:34,borderRadius:17,borderWidth:1.4,backgroundColor:'rgba(5,12,10,.88)',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.34,shadowRadius:8,elevation:6},
 businessInner:{width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.08)'}
});
const darkMapStyle:MapStyleElement[]=[
 {elementType:'geometry',stylers:[{color:'#0b120f'}]},
 {elementType:'labels.icon',stylers:[{visibility:'off'}]},
 {elementType:'labels.text.fill',stylers:[{color:'#84918a'}]},
 {elementType:'labels.text.stroke',stylers:[{color:'#0b120f'}]},
 {featureType:'administrative',elementType:'geometry',stylers:[{color:'#1d2a24'}]},
 {featureType:'administrative.locality',elementType:'labels.text.fill',stylers:[{color:'#c5cec9'}]},
 {featureType:'poi',elementType:'geometry',stylers:[{color:'#0d1813'}]},
 {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'road',elementType:'geometry',stylers:[{color:'#26302b'}]},
 {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#121a16'}]},
 {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#7e8a84'}]},
 {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#423f35'}]},
 {featureType:'road.highway',elementType:'geometry.stroke',stylers:[{color:'#171a16'}]},
 {featureType:'road.highway',elementType:'labels.text.fill',stylers:[{color:'#c6b58f'}]},
 {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'water',elementType:'geometry',stylers:[{color:'#07100e'}]},
 {featureType:'water',elementType:'labels.text.fill',stylers:[{color:'#526961'}]}
];
const premiumLightMapStyle:MapStyleElement[]=[
 {elementType:'geometry',stylers:[{color:'#e9ece8'}]},
 {elementType:'labels.icon',stylers:[{visibility:'off'}]},
 {elementType:'labels.text.fill',stylers:[{color:'#637068'}]},
 {elementType:'labels.text.stroke',stylers:[{color:'#f1f3f0'}]},
 {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'road',elementType:'geometry',stylers:[{color:'#ffffff'}]},
 {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#d7cfbf'}]},
 {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'water',elementType:'geometry',stylers:[{color:'#cbd8d2'}]}
];
