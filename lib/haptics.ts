import * as Haptics from 'expo-haptics';

async function safe(run:()=>Promise<void>){try{await run()}catch{return}}
export const haptic={
 light:()=>safe(()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
 medium:()=>safe(()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
 success:()=>safe(()=>Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
 warning:()=>safe(()=>Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
 selection:()=>safe(()=>Haptics.selectionAsync()),
};
