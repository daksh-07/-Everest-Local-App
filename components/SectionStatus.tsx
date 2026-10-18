import {View} from 'react-native';
import {AppText as Text} from '@/components/ui/AppText';
import {ErrorBanner} from '@/components/ui/ErrorBanner';
import {useAppTheme} from '@/lib/theme';

export function SectionStatus({label,section}:{label:string;section:{loading:boolean;error:boolean;data:unknown;retry:()=>Promise<void>}}){
 const {colors}=useAppTheme();
 if(section.error)return <ErrorBanner message={`${label} could not be refreshed.${section.data!==null?' Previously loaded information is shown.':''}`} retryLabel={`Retry ${label.toLowerCase()}`} onRetry={()=>void section.retry()}/>;
 if(section.loading)return <View accessibilityRole="progressbar" accessibilityLabel={`Loading ${label.toLowerCase()}`} accessibilityState={{busy:true}} style={{paddingVertical:12}}><Text style={{fontSize:14,lineHeight:20,color:colors.textSecondary}}>{section.data!==null?'Updating…':'Loading…'}</Text></View>;
 return null;
}
