import {useEffect,useState} from 'react';
import {ActivityIndicator,Image,Pressable,StyleSheet,Text,View,type ImageResizeMode,type ImageStyle,type StyleProp} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {signedPostMedia} from '@/lib/request-post-media';
import {useAppTheme} from '@/lib/theme';

export function PostMediaImage({postId,uri,index=0,style,resizeMode='cover'}:{postId:string;uri:string;index?:number;style:StyleProp<ImageStyle>;resizeMode?:ImageResizeMode}){
 const {colors}=useAppTheme();const [source,setSource]=useState(uri);const [state,setState]=useState<'ready'|'retrying'|'failed'>('ready');
 useEffect(()=>{setSource(uri);setState('ready')},[uri]);
 const retry=async()=>{if(state==='retrying')return;setState('retrying');try{const urls=await signedPostMedia(postId,{force:true,strict:true});const next=urls[index];if(!next)throw new Error('Missing media URL');setSource(next);setState('ready')}catch{setState('failed')}};
 if(state==='failed')return <Pressable accessibilityRole="button" accessibilityLabel="Retry post photo" onPress={()=>void retry()} style={[style,styles.fallback,{backgroundColor:colors.soft}]}><Ionicons name="image-outline" size={25} color={colors.muted}/><Text style={[styles.copy,{color:colors.textSecondary}]}>Photo unavailable</Text><Text style={[styles.retry,{color:colors.brand}]}>Tap to retry</Text></Pressable>;
 return <View style={[style,styles.frame]}>{state==='retrying'?<View style={[StyleSheet.absoluteFill,styles.loading,{backgroundColor:colors.soft}]}><ActivityIndicator color={colors.brand}/></View>:null}<Image source={{uri:source}} resizeMode={resizeMode} style={StyleSheet.absoluteFill} onError={()=>void retry()}/></View>;
}

const styles=StyleSheet.create({frame:{overflow:'hidden'},loading:{alignItems:'center',justifyContent:'center',zIndex:2},fallback:{alignItems:'center',justifyContent:'center',gap:5},copy:{fontSize:11,fontWeight:'800'},retry:{fontSize:9,fontWeight:'900'},});
