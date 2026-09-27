import {StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {LiveMapPoint} from '@/lib/everest-live';
import {useAppTheme} from '@/lib/theme';

// TypeScript/general fallback. Metro resolves LiveSearchMap.native.tsx on iOS/Android
// and LiveSearchMap.web.tsx on web before this file.
export function LiveSearchMap({customer,businesses,radiusKm}:{customer:LiveMapPoint|null;businesses:LiveMapPoint[];radiusKm:number}){
 const {colors}=useAppTheme();
 return <View style={[s.root,{backgroundColor:colors.soft,borderColor:colors.border}]}>
  <Ionicons name="map-outline" size={28} color={colors.muted}/>
  <Text style={[s.title,{color:colors.text}]}>{customer?'Live map':'Waiting for service location'}</Text>
  <Text style={[s.copy,{color:colors.muted}]}>{businesses.length} mapped · {Math.max(1,Math.round(radiusKm))} km search</Text>
 </View>;
}
const s=StyleSheet.create({root:{...StyleSheet.absoluteFillObject,borderWidth:1,alignItems:'center',justifyContent:'center'},title:{fontSize:13,fontWeight:'900',marginTop:8},copy:{fontSize:10,marginTop:4}});
