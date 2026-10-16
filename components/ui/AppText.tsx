import { createContext,forwardRef,useContext } from 'react';
import { Platform,StyleSheet,Text as NativeText,type TextProps,type TextStyle } from 'react-native';
import { FontReadyContext } from '@/lib/font-ready';
import { fontFace,nativeFontStyle,isDisplayRole,typography,type TypographyRole } from '@/lib/typography';
import { useOptionalThemeColors } from '@/lib/theme';

const InheritedWeight=createContext<TextStyle['fontWeight']>('400');
// True inside another AppText: nested runs inherit their parent's colour instead of the theme default.
const InsideText=createContext(false);
type Props=TextProps&{variant?:TypographyRole;tabular?:boolean};
/** Keeps RN text scaling, nesting, selection and native refs intact. */
export const AppText=forwardRef<NativeText,Props>(function AppText({variant,tabular,style,children,...props},ref){
  const ready=useContext(FontReadyContext);
  const inherited=useContext(InheritedWeight);
  const nested=useContext(InsideText);
  const themeColors=useOptionalThemeColors();
  const role=variant?typography[variant]:undefined;
  const flat=StyleSheet.flatten<TextStyle>([role,style]);
  const weight=flat?.fontWeight??inherited;
  const face=fontFace(weight,isDisplayRole(variant));
  const font:TextStyle=flat?.fontFamily?{}:Platform.OS==='web'
    ?{fontFamily:`"${face}", system-ui, -apple-system, sans-serif`,fontWeight:'normal'}
    :ready&&flat?.fontStyle!=='italic'?nativeFontStyle(face):{};
  // Top-level text defaults to the theme's text colour so a style without `color` never renders
  // black on the dark canvas. Explicit colours (style or variant) always win.
  const fallbackColor=!nested&&!flat?.color&&themeColors?{color:themeColors.text}:null;
  return <InsideText.Provider value><InheritedWeight.Provider value={weight}><NativeText {...props} ref={ref} style={[fallbackColor,role,style,font,tabular&&{fontVariant:['tabular-nums']}]}>{children}</NativeText></InheritedWeight.Provider></InsideText.Provider>;
});

export type AppText=NativeText;
