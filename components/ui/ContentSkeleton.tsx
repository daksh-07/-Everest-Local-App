import {StyleSheet,View} from 'react-native';
import {AppText} from './AppText';
import {Skeleton} from './Skeleton';
import {useAppTheme} from '@/lib/theme';

/** Static structure only: no invented progress, timers or decorative animation. */
export function ContentSkeleton({label,profile=false,leading=true}:{label:string;profile?:boolean;leading?:boolean}){
 const {colors}=useAppTheme();
 return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{busy:true}} style={styles.wrap}>
  <AppText variant="supporting" style={{color:colors.muted}}>{label}</AppText>
  {profile?<View style={styles.identity}><Skeleton width={56} height={56} radius={16}/><Skeleton width="82%" height={30}/><Skeleton width="60%" height={20}/><View style={styles.actions}><Skeleton width="30%" height={44}/><Skeleton width="30%" height={44}/><Skeleton width="30%" height={44}/></View></View>:null}
  {[0,1,2].map(row=><View key={row} style={[styles.row,{borderBottomColor:colors.border}]}>{leading&&!profile?<Skeleton width={40} height={40} radius={12}/>:null}<View style={styles.body}><Skeleton width={row===1?'65%':'85%'} height={20}/><Skeleton width="58%" height={14}/><Skeleton width="38%" height={14}/></View></View>)}
 </View>;
}
const styles=StyleSheet.create({wrap:{gap:20,paddingVertical:20},identity:{gap:16},actions:{flexDirection:'row',justifyContent:'space-between',marginTop:4},row:{flexDirection:'row',alignItems:'flex-start',gap:14,paddingVertical:16,borderBottomWidth:StyleSheet.hairlineWidth},body:{flex:1,gap:10}});
