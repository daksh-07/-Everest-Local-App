import {useEffect,useState} from 'react';
import {Pressable, type PressableProps} from 'react-native';
import Animated, {cancelAnimation, useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {useExperience} from '@/lib/experience';
import {useReducedMotion} from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Interruptible UI-thread feedback; resolve callback styles before Reanimated. */
export function MotionPressable({style, onPressIn, onPressOut, disabled, ...props}: PressableProps) {
  const {tokens} = useExperience();
  const [pressed,setPressed] = useState(false);
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));
  useEffect(() => {
    if (reduced || disabled) { cancelAnimation(scale); scale.value = 1; }
    return () => cancelAnimation(scale);
  }, [disabled, reduced, scale]);
  const settle = (value: number) => {
    cancelAnimation(scale);
    scale.value = reduced ? 1 : withSpring(value, {mass: .5, damping: 20, stiffness: 360});
  };
  return <AnimatedPressable accessibilityRole="button" {...props} disabled={disabled}
    onPressIn={event => {setPressed(true);settle(tokens.motion.pressScale); onPressIn?.(event);}}
    onPressOut={event => {setPressed(false);settle(1); onPressOut?.(event);}}
    style={[typeof style === 'function' ? style({pressed:pressed&&!disabled}) : style, animatedStyle]}
  />;
}
