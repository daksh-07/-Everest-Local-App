import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const BUTTON_WIDTH = 128;
const BUTTON_HEIGHT = 44;
const EDGE = 14;
const TOP_GUARD = 72;
const BOTTOM_GUARD = 112;
const TRASH_SIZE = 68;

export function DraggableAskEverest({ pathname }: { pathname: string }) {
  const { width, height } = useWindowDimensions();
  const hiddenRoute = ['/assistant', '/auth', '/messages', '/cart'].includes(pathname);
  const [dismissed, setDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [shredding, setShredding] = useState(false);
  const moved = useRef(false);

  const startX = Math.max(EDGE, width - BUTTON_WIDTH - EDGE);
  const startY = Math.max(TOP_GUARD, height - BOTTOM_GUARD - BUTTON_HEIGHT);
  const pan = useRef(new Animated.ValueXY({ x: startX, y: startY })).current;
  const last = useRef({ x: startX, y: startY });
  const shred = useRef(new Animated.Value(0)).current;

  const clampY = (y: number) => Math.min(Math.max(y, TOP_GUARD), Math.max(TOP_GUARD, height - BOTTOM_GUARD - BUTTON_HEIGHT));
  const trashCenter = { x: width / 2, y: height - 76 };

  const animateTo = (x: number, y: number) => {
    last.current = { x, y };
    Animated.spring(pan, {
      toValue: { x, y },
      damping: 22,
      stiffness: 220,
      mass: 0.72,
      useNativeDriver: false,
    }).start();
  };

  const dismissWithShred = () => {
    setShredding(true);
    Animated.timing(shred, { toValue: 1, duration: 360, useNativeDriver: true }).start(() => {
      setDismissed(true);
      setDragging(false);
      setOverTrash(false);
    });
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => {
      moved.current = false;
      setDragging(true);
      pan.stopAnimation((value) => {
        last.current = value;
        pan.setValue(value);
      });
    },
    onPanResponderMove: (_e, gesture) => {
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4) moved.current = true;
      const x = Math.min(Math.max(last.current.x + gesture.dx, EDGE), Math.max(EDGE, width - BUTTON_WIDTH - EDGE));
      const y = clampY(last.current.y + gesture.dy);
      pan.setValue({ x, y });
      const centerX = x + BUTTON_WIDTH / 2;
      const centerY = y + BUTTON_HEIGHT / 2;
      const distance = Math.hypot(centerX - trashCenter.x, centerY - trashCenter.y);
      setOverTrash(distance < TRASH_SIZE);
    },
    onPanResponderRelease: (_e, gesture) => {
      const x = Math.min(Math.max(last.current.x + gesture.dx, EDGE), Math.max(EDGE, width - BUTTON_WIDTH - EDGE));
      const y = clampY(last.current.y + gesture.dy);
      const centerX = x + BUTTON_WIDTH / 2;
      const centerY = y + BUTTON_HEIGHT / 2;
      const distance = Math.hypot(centerX - trashCenter.x, centerY - trashCenter.y);

      if (moved.current && distance < TRASH_SIZE) {
        dismissWithShred();
        return;
      }

      if (!moved.current) {
        setDragging(false);
        router.push('/assistant');
        return;
      }

      const snappedX = centerX < width / 2 ? EDGE : Math.max(EDGE, width - BUTTON_WIDTH - EDGE);
      animateTo(snappedX, y);
      setDragging(false);
      setOverTrash(false);
    },
    onPanResponderTerminate: () => {
      animateTo(last.current.x, clampY(last.current.y));
      setDragging(false);
      setOverTrash(false);
    },
  }), [height, width]);

  if (hiddenRoute || dismissed) return null;

  return <>
    {dragging && <View pointerEvents="none" style={[styles.trashZone, overTrash && styles.trashZoneActive]}>
      <View style={[styles.trashCircle, overTrash && styles.trashCircleActive]}>
        <Ionicons name={overTrash ? 'close' : 'trash-outline'} size={25} color={overTrash ? '#fff' : '#555'} />
      </View>
      <Text style={[styles.trashText, overTrash && styles.trashTextActive]}>{overTrash ? 'REMOVE' : 'DROP TO REMOVE'}</Text>
    </View>}

    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.askButton,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
        dragging && styles.askDragging,
        shredding && {
          opacity: shred.interpolate({ inputRange: [0, .7, 1], outputRange: [1, .72, 0] }),
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scaleY: shred.interpolate({ inputRange: [0, 1], outputRange: [1, .12] }) },
            { scaleX: shred.interpolate({ inputRange: [0, 1], outputRange: [1, .82] }) },
          ],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Ask Everest. Drag to move, or drag to the remove target to hide."
    >
      <Ionicons name="sparkles" size={13} color="#fff" />
      <Text style={styles.askButtonText}>Ask Everest</Text>
      {shredding && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[0,1,2,3,4,5].map((i) => <Animated.View key={i} style={[
          styles.shredStrip,
          {
            top: i * (BUTTON_HEIGHT / 6),
            transform: [{ translateX: shred.interpolate({ inputRange: [0,1], outputRange: [0, i % 2 === 0 ? -28 : 28] }) }],
            opacity: shred.interpolate({ inputRange: [0,.85,1], outputRange: [.95,.5,0] }),
          },
        ]}/>)}
      </View>}
    </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  askButton:{
    position:'absolute',left:0,top:0,width:BUTTON_WIDTH,height:BUTTON_HEIGHT,borderRadius:22,
    backgroundColor:'#111',paddingHorizontal:14,flexDirection:'row',gap:7,alignItems:'center',justifyContent:'center',
    shadowColor:'#000',shadowOpacity:.14,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:8,zIndex:90,
  },
  askDragging:{shadowOpacity:.22,shadowRadius:16,elevation:12},
  askButtonText:{color:'#fff',fontSize:11,fontWeight:'900'},
  trashZone:{position:'absolute',left:'50%',bottom:78,marginLeft:-62,width:124,alignItems:'center',zIndex:89},
  trashZoneActive:{transform:[{scale:1.03}]},
  trashCircle:{width:58,height:58,borderRadius:29,backgroundColor:'rgba(255,255,255,.96)',borderWidth:1,borderColor:'#d7d3cc',alignItems:'center',justifyContent:'center'},
  trashCircleActive:{backgroundColor:'#111',borderColor:'#111',transform:[{scale:1.08}]},
  trashText:{marginTop:6,fontSize:8,fontWeight:'900',letterSpacing:.7,color:'#777'},
  trashTextActive:{color:'#111'},
  shredStrip:{position:'absolute',left:0,right:0,height:BUTTON_HEIGHT/7,backgroundColor:'#111',borderRadius:3},
});
