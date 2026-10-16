import {Ionicons} from '@/components/ui/Icon';
import {router} from 'expo-router';
import {Pressable,StyleSheet} from 'react-native';
import {useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

/** Ask Everest as a header action. Replaces the draggable floating button so the
 * assistant never covers screen content; place it beside a screen's other header icons. */
export function AskEverestButton(){
 const {colors}=useAppTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel="Ask Everest" accessibilityHint="Opens the Everest assistant" hitSlop={4}
  onPress={()=>{void haptic.selection();router.push('/assistant')}}
  style={({pressed})=>[styles.button,pressed&&{backgroundColor:colors.soft}]}>
  <Ionicons name="sparkles-outline" size={21} color={colors.accent}/>
 </Pressable>;
}
const styles=StyleSheet.create({button:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'}});
