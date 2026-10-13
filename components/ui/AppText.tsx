import { createContext,forwardRef,useContext } from 'react';
import { Platform,StyleSheet,Text as NativeText,type TextProps,type TextStyle } from 'react-native';
import { FontReadyContext } from '@/lib/font-ready';
import { fontFace,isDisplayRole,typography,type TypographyRole } from '@/lib/typography';

const InheritedWeight=createContext<TextStyle['fontWeight']>('400');
type Props=TextProps&{variant?:TypographyRole;tabular?:boolean};
/** Keeps RN text scaling, nesting, selection and native refs intact. */
export const AppText=forwardRef<NativeText,Props>(function AppText({variant,tabular,style,children,...props},ref){
  const ready=useContext(FontReadyContext);
  const inherited=useContext(InheritedWeight);
  const role=variant?typography[variant]:undefined;
  const flat=StyleSheet.flatten<TextStyle>([role,style]);
  const weight=flat?.fontWeight??inherited;
  const face=fontFace(weight,isDisplayRole(variant));
  const font:TextStyle=flat?.fontFamily?{}:Platform.OS==='web'
    ?{fontFamily:`"${face}", system-ui, -apple-system, sans-serif`,fontWeight:'normal'}
    :ready&&flat?.fontStyle!=='italic'?{fontFamily:face,fontWeight:'normal'}:{};
  return <InheritedWeight.Provider value={weight}><NativeText {...props} ref={ref} style={[role,style,font,tabular&&{fontVariant:['tabular-nums']}]}>{children}</NativeText></InheritedWeight.Provider>;
});

export type AppText=NativeText;
