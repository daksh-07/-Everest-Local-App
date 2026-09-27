import React,{useMemo,useState} from 'react';
import {StyleSheet,Text,View,type LayoutChangeEvent} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {type LiveMapPoint} from '@/lib/everest-live';
import {useAppTheme} from '@/lib/theme';

export function LiveSearchMap({customer,businesses,radiusKm}:{customer:LiveMapPoint|null;businesses:LiveMapPoint[];radiusKm:number}){
 const {colors,isDark}=useAppTheme();const [size,setSize]=useState({width:1,height:1});
 const projection=useMemo(()=>{if(!customer)return null;const latHalf=Math.max(.012,(radiusKm/111)*1.3);const lonHalf=latHalf/Math.max(.2,Math.cos(customer.latitude*Math.PI/180));return{latHalf,lonHalf}},[customer,radiusKm]);
 if(!customer)return <View style={[s.empty,{backgroundColor:colors.soft,borderColor:colors.border}]}><Ionicons name="map-outline" size={28} color={colors.muted}/><Text style={[s.emptyText,{color:colors.muted}]}>Waiting for the confirmed service pin…</Text></View>;
 const latHalf=projection?.latHalf??.02,lonHalf=projection?.lonHalf??.02;
 const bbox=[customer.longitude-lonHalf,customer.latitude-latHalf,customer.longitude+lonHalf,customer.latitude+latHalf].join(',');
 const src=`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${customer.latitude}%2C${customer.longitude}`;
 const onLayout=(e:LayoutChangeEvent)=>setSize({width:Math.max(1,e.nativeEvent.layout.width),height:Math.max(1,e.nativeEvent.layout.height)});
 const xy=(p:LiveMapPoint)=>({left:size.width*(.5+(p.longitude-customer.longitude)/(2*lonHalf))-16,top:size.height*(.5-(p.latitude-customer.latitude)/(2*latHalf))-16});
 return <View onLayout={onLayout} style={s.root}>
  {React.createElement('iframe' as never,{src,title:'Everest Live map',style:{width:'100%',height:'100%',border:0,filter:isDark?'grayscale(70%) sepia(18%) hue-rotate(92deg) saturate(75%) brightness(48%) contrast(128%)':'grayscale(18%) saturate(72%) contrast(104%)'}} as never)}
  <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.mapTint]}/>
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
   <View style={[s.radius,{left:size.width*.16,top:size.height*.16,width:size.width*.68,height:size.height*.68,borderRadius:999}]}/>
   <View style={[s.radiusInner,{left:size.width*.33,top:size.height*.33,width:size.width*.34,height:size.height*.34,borderRadius:999}]}/>
   <View style={[s.youOuter,{left:size.width/2-24,top:size.height/2-24}]}><View style={s.youInner}><Ionicons name="navigate" size={17} color="#07110d"/></View></View>
   {businesses.map(p=>{const pos=xy(p);const responded=p.activity==='RESPONDED';const viewed=p.activity==='VIEWED';const tone=responded?colors.success:viewed?colors.accent:'rgba(224,233,228,.78)';return <View key={p.business_id??`${p.latitude}:${p.longitude}`} style={[s.businessOuter,pos,{borderColor:tone}]}><View style={[s.businessInner,{backgroundColor:responded?'rgba(74,214,157,.22)':viewed?'rgba(220,190,145,.18)':'rgba(12,20,17,.92)'}]}><Ionicons name={responded?'chatbubble-ellipses':'storefront'} size={12} color={tone}/></View></View>})}
  </View>
  <View style={s.attribution}><Text style={s.attributionText}>© OpenStreetMap contributors</Text></View>
 </View>;
}
const s=StyleSheet.create({
 root:{...StyleSheet.absoluteFillObject,overflow:'hidden',backgroundColor:'#08100d'},
 empty:{...StyleSheet.absoluteFillObject,borderWidth:1,alignItems:'center',justifyContent:'center',gap:8},
 emptyText:{fontSize:11,fontWeight:'700'},
 mapTint:{backgroundColor:'rgba(4,14,10,.16)'},
 radius:{position:'absolute',borderWidth:1.4,borderColor:'rgba(117,237,189,.52)',backgroundColor:'rgba(70,202,150,.025)'},
 radiusInner:{position:'absolute',borderWidth:1,borderColor:'rgba(117,237,189,.24)',backgroundColor:'rgba(70,202,150,.018)'},
 youOuter:{position:'absolute',width:48,height:48,borderRadius:24,borderWidth:1.5,borderColor:'rgba(147,255,211,.88)',backgroundColor:'rgba(6,17,13,.9)',alignItems:'center',justifyContent:'center',shadowColor:'#6ff0b9',shadowOpacity:.65,shadowRadius:14},
 youInner:{width:29,height:29,borderRadius:15,backgroundColor:'#a9f3d2',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.72)'},
 businessOuter:{position:'absolute',width:34,height:34,borderRadius:17,borderWidth:1.4,backgroundColor:'rgba(5,12,10,.88)',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.34,shadowRadius:8},
 businessInner:{width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.08)'},
 attribution:{position:'absolute',right:6,bottom:5,backgroundColor:'rgba(0,0,0,.58)',borderRadius:5,paddingHorizontal:5,paddingVertical:2},
 attributionText:{fontSize:7,color:'#fff'}
});
