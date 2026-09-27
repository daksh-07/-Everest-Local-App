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
  {React.createElement('iframe' as never,{src,title:'Everest Live map',style:{width:'100%',height:'100%',border:0,filter:isDark?'grayscale(35%) invert(88%) hue-rotate(115deg) brightness(55%) contrast(110%)':'none'}} as never)}
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
   <View style={[s.radius,{borderColor:colors.accent,left:size.width*.18,top:size.height*.18,width:size.width*.64,height:size.height*.64,borderRadius:999}]}/>
   <View style={[s.you,{backgroundColor:colors.brand,borderColor:colors.elevated,left:size.width/2-22,top:size.height/2-22}]}><Ionicons name="home" size={18} color={colors.onBrand}/></View>
   {businesses.map(p=>{const pos=xy(p);return <View key={p.business_id??`${p.latitude}:${p.longitude}`} style={[s.business,pos,{backgroundColor:p.activity==='RESPONDED'?colors.success:p.activity==='VIEWED'?colors.brand:colors.elevated,borderColor:colors.canvas}]}><Ionicons name={p.activity==='RESPONDED'?'chatbubble-ellipses':'storefront'} size={12} color={p.activity==='VIEWED'?colors.onBrand:colors.text}/></View>})}
  </View>
  <View style={s.attribution}><Text style={s.attributionText}>© OpenStreetMap contributors</Text></View>
 </View>;
}
const s=StyleSheet.create({
 root:{...StyleSheet.absoluteFillObject,overflow:'hidden',backgroundColor:'#111'},
 empty:{...StyleSheet.absoluteFillObject,borderWidth:1,alignItems:'center',justifyContent:'center',gap:8},
 emptyText:{fontSize:11,fontWeight:'700'},
 radius:{position:'absolute',borderWidth:1.5,backgroundColor:'rgba(220,190,145,.07)'},
 you:{position:'absolute',width:44,height:44,borderRadius:22,borderWidth:4,alignItems:'center',justifyContent:'center'},
 business:{position:'absolute',width:32,height:32,borderRadius:16,borderWidth:3,alignItems:'center',justifyContent:'center'},
 attribution:{position:'absolute',right:6,bottom:5,backgroundColor:'rgba(0,0,0,.58)',borderRadius:5,paddingHorizontal:5,paddingVertical:2},
 attributionText:{fontSize:7,color:'#fff'}
});
