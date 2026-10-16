// Candidate colour directions compared on identical screens (docs/design/colour-identity.md).
// Each is a complete ThemeColors set, so a candidate can be swapped into lib/theme-colors.ts for
// capture without touching components. The selected direction is the one shipped in lib/theme-colors.ts.
const neutralsLight={canvas:'#F8FAFC',surface:'#FFFFFF',elevated:'#F1F4F9',soft:'#EDF1F7',input:'#FFFFFF',navigation:'#FFFFFF',text:'#161A24',textSecondary:'#4F5869',muted:'#5B6476',border:'#E1E6EE',borderStrong:'#7A8498',overlay:'rgba(14,18,30,.52)',disabled:'#E3E7EE',onDisabled:'#5F6778'};
const neutralsDark={canvas:'#000000',surface:'#111111',elevated:'#1F1F1F',soft:'#262626',input:'#161616',navigation:'#0C0C0C',text:'#F3F5F9',textSecondary:'#C5CAD3',muted:'#A6ACB8',border:'#2E2E2E',borderStrong:'#7C7C7C',overlay:'rgba(0,0,0,.76)',disabled:'#2A2A2A',onDisabled:'#9A9FA9'};
const statusLight={rating:'#A86500',success:'#13773A',successContainer:'#E2F4E7',warning:'#8A5700',warningContainer:'#FFF2D3',danger:'#C0262D',dangerContainer:'#FDE7E7',info:'#0B67A3',infoContainer:'#E1F0FA'};
const statusDark={rating:'#F3C455',success:'#72D08F',successContainer:'#0E2B18',warning:'#F3C455',warningContainer:'#30250A',danger:'#FF8C85',dangerContainer:'#3A1312',info:'#7EC6F4',infoContainer:'#0D283A'};

function withLegacy(p){
 // Legacy keys used across the app map onto the new roles: brand fills = primary,
 // accent = primary used as text/icons, accentSoft = primary container.
 return {...p,brand:p.primary,onBrand:p.onPrimary,accent:p.primaryText,accentSoft:p.primaryContainer,selected:p.primaryContainer,onSelected:p.onPrimaryContainer,focus:p.focus??p.primary};
}

export const candidates={
 electric:{
  name:'Everest Electric',
  light:withLegacy({...neutralsLight,...statusLight,primary:'#315BEE',onPrimary:'#FFFFFF',primaryText:'#2A4FD6',primaryContainer:'#E8EEFF',onPrimaryContainer:'#1A3797',secondary:'#087E78',secondaryText:'#06716C',onSecondary:'#FFFFFF',secondaryContainer:'#DBF4F1',onSecondaryContainer:'#05504C',tertiary:'#F36B52',onTertiary:'#161A24',tertiaryContainer:'#FFE9E3',onTertiaryContainer:'#952F1B'}),
  dark:withLegacy({...neutralsDark,...statusDark,primary:'#88A5FF',onPrimary:'#0A1A4A',primaryText:'#9DB5FF',primaryContainer:'#17275A',onPrimaryContainer:'#D7E1FF',secondary:'#73DED2',secondaryText:'#73DED2',onSecondary:'#00332F',secondaryContainer:'#0A3834',onSecondaryContainer:'#B6F1E9',tertiary:'#FF9A85',onTertiary:'#3A0D04',tertiaryContainer:'#45190F',onTertiaryContainer:'#FFD4CA'}),
 },
 alpine:{
  name:'Alpine Teal',
  light:withLegacy({...neutralsLight,...statusLight,primary:'#0B6F6B',onPrimary:'#FFFFFF',primaryText:'#0A6763',primaryContainer:'#DAF2EF',onPrimaryContainer:'#05403D',secondary:'#3D52C9',secondaryText:'#3D52C9',onSecondary:'#FFFFFF',secondaryContainer:'#E6E9FF',onSecondaryContainer:'#22328A',tertiary:'#F0A23B',onTertiary:'#161A24',tertiaryContainer:'#FFF0D9',onTertiaryContainer:'#7A4800'}),
  dark:withLegacy({...neutralsDark,...statusDark,primary:'#6FD6CC',onPrimary:'#00302C',primaryText:'#7EE0D6',primaryContainer:'#0A3532',onPrimaryContainer:'#B9F1EA',secondary:'#A3B1FF',secondaryText:'#A3B1FF',onSecondary:'#111C55',secondaryContainer:'#1C2456',onSecondaryContainer:'#DDE2FF',tertiary:'#F7C273',onTertiary:'#3A2500',tertiaryContainer:'#3B2805',onTertiaryContainer:'#FFE3B8'}),
 },
 sunrise:{
  name:'Sunrise Coral',
  light:withLegacy({...neutralsLight,...statusLight,primary:'#CC3A22',onPrimary:'#FFFFFF',primaryText:'#C23A24',primaryContainer:'#FFE8E2',onPrimaryContainer:'#8A2312',secondary:'#24508F',secondaryText:'#24508F',onSecondary:'#FFFFFF',secondaryContainer:'#E2EBF8',onSecondaryContainer:'#163663',tertiary:'#F2B544',onTertiary:'#161A24',tertiaryContainer:'#FFF2D6',onTertiaryContainer:'#7A5200'}),
  dark:withLegacy({...neutralsDark,...statusDark,primary:'#FF9077',onPrimary:'#3D0A02',primaryText:'#FF9F89',primaryContainer:'#45160C',onPrimaryContainer:'#FFD6CC',secondary:'#9DBDF0',secondaryText:'#9DBDF0',onSecondary:'#0B2547',secondaryContainer:'#13294A',onSecondaryContainer:'#D6E5FB',tertiary:'#F7CC74',onTertiary:'#3A2900',tertiaryContainer:'#3A2A05',onTertiaryContainer:'#FFE6B5'}),
 },
};
