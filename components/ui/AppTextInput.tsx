import { forwardRef,useContext } from 'react';
import { Platform,StyleSheet,TextInput as NativeTextInput,type TextInputProps,type TextStyle } from 'react-native';
import { FontReadyContext } from '@/lib/font-ready';
import { fontFace } from '@/lib/typography';

export const AppTextInput=forwardRef<NativeTextInput,TextInputProps>(function AppTextInput({style,...props},ref){
  const ready=useContext(FontReadyContext);
  const flat=StyleSheet.flatten(style);
  const face=fontFace(flat?.fontWeight);
  const font:TextStyle=flat?.fontFamily?{}:Platform.OS==='web'
    ?{fontFamily:`"${face}", system-ui, -apple-system, sans-serif`,fontWeight:'normal'}
    :ready&&flat?.fontStyle!=='italic'?{fontFamily:face,fontWeight:'normal'}:{};
  return <NativeTextInput {...props} ref={ref} style={[style,font]}/>;
});

export type AppTextInput=NativeTextInput;
