import {useMemo,useState} from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {Ionicons} from '@expo/vector-icons';
import {type LiveMapPoint} from '@/lib/everest-live';
import {useAppTheme} from '@/lib/theme';

const TILE=256;
// CARTO's keyless basemaps now return 'API KEY REQUIRED' placeholder tiles, and OpenStreetMap's
// public tile servers do not permit production app traffic. A provider is opt-in: set
// EXPO_PUBLIC_LIVE_MAP_TILE_URL to a template with {z}/{x}/{y} (and any key it needs) and
// EXPO_PUBLIC_LIVE_MAP_ATTRIBUTION to its required credit. Without it the map is schematic:
// the same projected positions on a neutral grid, with no tiles and no borrowed attribution.
const TILE_TEMPLATE=process.env.EXPO_PUBLIC_LIVE_MAP_TILE_URL?.trim()||'';
const TILE_ATTRIBUTION=process.env.EXPO_PUBLIC_LIVE_MAP_ATTRIBUTION?.trim()||'';
const GRID=48;
function metersPerPixel(latitude:number,zoom:number){return 156543.03392*Math.cos(latitude*Math.PI/180)/2**zoom}
function zoomForRadius(radiusKm:number){return radiusKm<=3?13:radiusKm<=7?12:radiusKm<=12?11:10}
function worldPixel(latitude:number,longitude:number,zoom:number){
 const scale=TILE*2**zoom;const lat=Math.max(-85.0511,Math.min(85.0511,latitude));const sin=Math.sin(lat*Math.PI/180);
 return{x:(longitude+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
}

export function LiveSearchMap({customer,businesses,radiusKm}:{customer:LiveMapPoint|null;businesses:LiveMapPoint[];radiusKm:number}){
 const {colors}=useAppTheme();const [size,setSize]=useState({width:1,height:1});const zoom=zoomForRadius(radiusKm);
 const scene=useMemo(()=>{
  if(!customer)return null;
  const center=worldPixel(customer.latitude,customer.longitude,zoom);const left=center.x-size.width/2;const top=center.y-size.height/2;const n=2**zoom;
  const tiles:{key:string;uri:string;left:number;top:number}[]=[];
  const minX=Math.floor(left/TILE)-1,maxX=Math.floor((left+size.width)/TILE)+1,minY=Math.max(0,Math.floor(top/TILE)-1),maxY=Math.min(n-1,Math.floor((top+size.height)/TILE)+1);
  if(TILE_TEMPLATE)for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++){const wrapped=((tx%n)+n)%n;tiles.push({key:`${zoom}:${tx}:${ty}`,uri:TILE_TEMPLATE.replace('{z}',String(zoom)).replace('{x}',String(wrapped)).replace('{y}',String(ty)),left:tx*TILE-left,top:ty*TILE-top})}
  const xy=(p:LiveMapPoint)=>{const pos=worldPixel(p.latitude,p.longitude,zoom);return{left:pos.x-left-17,top:pos.y-top-17}};
  // Draw the search ring at the real radius for this zoom, not a fixed share of the box.
  const radiusPx=radiusKm*1000/metersPerPixel(customer.latitude,zoom);
  return{tiles,xy,radiusPx};
 },[customer,radiusKm,size.height,size.width,zoom]);
 // Distinct keys: without them React reuses the empty-state node, React Native Web never attaches
 // its layout observer to the map, and every marker is positioned for a 1×1 box.
 if(!customer)return <View key="live-map-empty" style={[s.empty,{backgroundColor:colors.soft,borderColor:colors.border}]}><Ionicons name="map-outline" size={28} color={colors.muted}/><Text style={[s.emptyText,{color:colors.muted}]}>Waiting for the confirmed service pin…</Text></View>;
 const onLayout=(e:LayoutChangeEvent)=>setSize({width:Math.max(1,e.nativeEvent.layout.width),height:Math.max(1,e.nativeEvent.layout.height)});
 return <View key="live-map" onLayout={onLayout} style={s.root}>
  {!TILE_TEMPLATE?<View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({length:Math.ceil(size.width/GRID)+1},(_,i)=><View key={'v'+i} style={[s.gridV,{left:i*GRID}]}/>)}{Array.from({length:Math.ceil(size.height/GRID)+1},(_,i)=><View key={'h'+i} style={[s.gridH,{top:i*GRID}]}/>)}</View>:null}
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>{scene?.tiles.map(tile=><Image key={tile.key} source={{uri:tile.uri}} resizeMode="cover" style={[s.tile,{left:tile.left,top:tile.top}]}/>)}</View>
  <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.mapTint]}/>
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
   {scene?<View style={[s.radius,{left:size.width/2-scene.radiusPx,top:size.height/2-scene.radiusPx,width:scene.radiusPx*2,height:scene.radiusPx*2,borderRadius:scene.radiusPx}]}/>:null}
   {scene?<View style={[s.radiusInner,{left:size.width/2-scene.radiusPx/2,top:size.height/2-scene.radiusPx/2,width:scene.radiusPx,height:scene.radiusPx,borderRadius:scene.radiusPx/2}]}/>:null}
   <View style={[s.youOuter,{left:size.width/2-24,top:size.height/2-24}]}><View style={s.youInner}><Ionicons name="navigate" size={17} color="#07110d"/></View></View>
   {businesses.map(p=>{const pos=scene?.xy(p)??{left:-100,top:-100};const responded=p.activity==='RESPONDED';const viewed=p.activity==='VIEWED';const tone=responded?colors.success:viewed?colors.accent:'rgba(224,233,228,.78)';return <View key={p.business_id??`${p.latitude}:${p.longitude}`} style={[s.businessOuter,pos,{borderColor:tone}]}><View style={[s.businessInner,{backgroundColor:responded?'rgba(74,214,157,.22)':viewed?'rgba(220,190,145,.18)':'rgba(12,20,17,.92)'}]}><Ionicons name={responded?'chatbubble-ellipses':'storefront'} size={12} color={tone}/></View></View>})}
  </View>
  {TILE_TEMPLATE&&TILE_ATTRIBUTION?<View pointerEvents="none" style={s.attribution}><Text style={s.attributionText}>{TILE_ATTRIBUTION}</Text></View>:null}
 </View>;
}
const s=StyleSheet.create({
 root:{...StyleSheet.absoluteFillObject,overflow:'hidden',backgroundColor:'#08100d'},
 empty:{...StyleSheet.absoluteFillObject,borderWidth:1,alignItems:'center',justifyContent:'center',gap:8},
 emptyText:{fontSize:13,fontWeight:'500'},
 tile:{position:'absolute',width:TILE,height:TILE},
 gridV:{position:'absolute',top:0,bottom:0,width:StyleSheet.hairlineWidth,backgroundColor:'rgba(190,220,205,.07)'},
 gridH:{position:'absolute',left:0,right:0,height:StyleSheet.hairlineWidth,backgroundColor:'rgba(190,220,205,.07)'},
 mapTint:{backgroundColor:'rgba(3,13,9,.08)'},
 radius:{position:'absolute',borderWidth:1.4,borderColor:'rgba(117,237,189,.52)',backgroundColor:'rgba(70,202,150,.025)'},
 radiusInner:{position:'absolute',borderWidth:1,borderColor:'rgba(117,237,189,.24)',backgroundColor:'rgba(70,202,150,.018)'},
 youOuter:{position:'absolute',width:48,height:48,borderRadius:24,borderWidth:1.5,borderColor:'rgba(147,255,211,.88)',backgroundColor:'rgba(6,17,13,.9)',alignItems:'center',justifyContent:'center',shadowColor:'#6ff0b9',shadowOpacity:.65,shadowRadius:14},
 youInner:{width:29,height:29,borderRadius:15,backgroundColor:'#a9f3d2',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.72)'},
 businessOuter:{position:'absolute',width:34,height:34,borderRadius:17,borderWidth:1.4,backgroundColor:'rgba(5,12,10,.88)',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.34,shadowRadius:8},
 businessInner:{width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.08)'},
 attribution:{position:'absolute',right:7,bottom:5,backgroundColor:'rgba(0,0,0,.58)',borderRadius:6,paddingHorizontal:6,paddingVertical:3},
 attributionText:{fontSize:12,color:'rgba(255,255,255,.86)'}
});
