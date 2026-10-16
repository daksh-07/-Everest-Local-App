import {Ionicons} from '@expo/vector-icons';
import {router,type Href} from 'expo-router';
import type {ReactNode} from 'react';
import {Pressable,StyleSheet,View,type StyleProp,type ViewStyle} from 'react-native';
import {AppText as Text} from './AppText';
import {useAppTheme} from '@/lib/theme';

/** Header for pushed (non-tab) screens: a real back control, the screen title, optional
 * supporting line and trailing actions. Back falls back to `fallback` when there is no history
 * (deep link, refreshed web page, installed PWA). */
export function ScreenHeader({title,subtitle,fallback='/',actions,showBack=true,style}:{title:string;subtitle?:string;fallback?:Href;actions?:ReactNode;showBack?:boolean;style?:StyleProp<ViewStyle>}){
 const {colors}=useAppTheme();
 return <View style={style}>
  <View style={styles.bar}>
   {showBack?<Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={4} onPress={()=>router.canGoBack()?router.back():router.replace(fallback)} style={({pressed})=>[styles.icon,pressed&&{backgroundColor:colors.soft}]}><Ionicons name="chevron-back" size={24} color={colors.text}/></Pressable>:null}
   <View style={styles.spacer}/>
   {actions?<View style={styles.actions}>{actions}</View>:null}
  </View>
  <Text accessibilityRole="header" variant="title" style={[styles.title,{color:colors.text}]}>{title}</Text>
  {subtitle?<Text style={[styles.subtitle,{color:colors.textSecondary}]}>{subtitle}</Text>:null}
 </View>;
}
/** 44×44 icon action for ScreenHeader `actions`. */
export function HeaderIconButton({icon,label,onPress,badge}:{icon:React.ComponentProps<typeof Ionicons>['name'];label:string;onPress:()=>void;badge?:number}){
 const {colors}=useAppTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={badge?`${label}, ${badge}`:label} hitSlop={4} onPress={onPress} style={({pressed})=>[styles.icon,pressed&&{backgroundColor:colors.soft}]}>
  <Ionicons name={icon} size={22} color={colors.text}/>
  {badge?<View style={[styles.badge,{backgroundColor:colors.brand,borderColor:colors.canvas}]}><Text style={[styles.badgeText,{color:colors.onBrand}]}>{badge>99?'99+':badge}</Text></View>:null}
 </Pressable>;
}
const styles=StyleSheet.create({
 bar:{minHeight:48,flexDirection:'row',alignItems:'center',marginHorizontal:-10},
 spacer:{flex:1},
 actions:{flexDirection:'row',alignItems:'center',gap:2},
 icon:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
 title:{marginTop:2},
 subtitle:{fontSize:15,lineHeight:21,marginTop:4},
 badge:{position:'absolute',right:4,top:4,minWidth:18,height:18,borderRadius:9,borderWidth:2,alignItems:'center',justifyContent:'center',paddingHorizontal:3},
 badgeText:{fontSize:11,lineHeight:13,fontWeight:'700'},
});
