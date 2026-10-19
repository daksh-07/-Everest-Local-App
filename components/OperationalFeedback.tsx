import {View} from 'react-native';
import {AppText} from '@/components/ui/AppText';
import {ErrorBanner} from '@/components/ui';
import type {OperationalStatus} from '@/lib/operational-reads';

export function OperationalFeedback({sources,retry}:{sources:OperationalStatus;retry:(source:string)=>void}){
 return <View style={{gap:8,marginTop:12}}>{Object.entries(sources).filter(([,state])=>state!=='ready').map(([name,state])=>state==='error'
  ?<ErrorBanner key={name} message={`${name} unavailable. Other loaded information is still shown.`} retryLabel={`Retry ${name.toLowerCase()}`} onRetry={()=>retry(name)}/>
  :<AppText key={name} accessibilityLiveRegion="polite">Loading {name.toLowerCase()}…</AppText>)}</View>;
}
