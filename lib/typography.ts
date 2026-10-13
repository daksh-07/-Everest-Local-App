import type { TextStyle } from 'react-native';

export const fontFaces = {
  regular: 'Inter-Regular', medium: 'Inter-Medium', semibold: 'Inter-SemiBold', bold: 'Inter-Bold',
  display: 'BricolageGrotesque-SemiBold', displayBold: 'BricolageGrotesque-Bold',
} as const;
export const typography = {
  hero: {fontSize:34,lineHeight:40,fontWeight:'700',letterSpacing:-.5},
  title: {fontSize:28,lineHeight:34,fontWeight:'600',letterSpacing:-.3},
  section: {fontSize:22,lineHeight:28,fontWeight:'600',letterSpacing:0},
  card: {fontSize:17,lineHeight:23,fontWeight:'600'},
  body: {fontSize:16,lineHeight:24,fontWeight:'400'},
  button: {fontSize:15,lineHeight:21,fontWeight:'600'},
  supporting: {fontSize:14,lineHeight:20,fontWeight:'400'},
  metadata: {fontSize:12,lineHeight:18,fontWeight:'500'},
  price: {fontSize:26,lineHeight:32,fontWeight:'600',fontVariant:['tabular-nums']},
} satisfies Record<string,TextStyle>;
export type TypographyRole = keyof typeof typography;
export function isDisplayRole(role?:TypographyRole) { return role==='hero'||role==='title'||role==='section'; }
/** Existing 800/900 styles resolve to a real 700 face, never synthetic bold. */
export function fontFace(weight:TextStyle['fontWeight']='400',display=false) {
  const value=weight==='bold'?700:weight==='normal'?400:Number(weight)||400;
  return display ? value>=700?fontFaces.displayBold:fontFaces.display
    : value>=700?fontFaces.bold:value>=600?fontFaces.semibold:value>=500?fontFaces.medium:fontFaces.regular;
}
