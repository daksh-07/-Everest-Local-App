import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Skeleton } from './Skeleton';
import { useAppTheme } from '@/lib/theme';

/** Reserve layout immediately; fast reads finish before placeholders appear.
 * Static, indeterminate structure: never a claim about payment or upload progress. */
export function TransactionLoading({
  kind,
  label,
}: {
  kind: 'cart' | 'booking' | 'details';
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  const { colors: c } = useAppTheme();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(timer);
  }, []);
  const height = kind === 'details' ? 124 : kind === 'cart' ? 520 : 560;
  return (
    <View style={{ minHeight: height }}>
      {visible ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityState={{ busy: true }}
          style={s.wrap}
        >
          <AppText style={{ fontSize: 14, color: c.textSecondary }}>
            {label}
          </AppText>
          {kind === 'details' ? (
            <>
              <Skeleton width="64%" height={20} />
              <Skeleton width="90%" height={16} />
              <Skeleton width="75%" height={16} />
            </>
          ) : kind === 'booking' ? (
            <>
              <Skeleton width="74%" height={32} />
              <Skeleton width="52%" height={18} />
              <Skeleton height={168} radius={20} />
              <Skeleton height={100} radius={16} />
              <Skeleton height={48} radius={14} />
            </>
          ) : (
            <>
              <Skeleton width="48%" height={22} />
              <View style={s.item}>
                <Skeleton width="76%" height={20} />
                <Skeleton width="58%" height={16} />
                <View style={s.line}>
                  <Skeleton width={122} height={44} />
                  <Skeleton width={78} height={24} />
                </View>
              </View>
              <Skeleton width="65%" height={22} />
              <Skeleton height={70} radius={14} />
              <Skeleton height={70} radius={14} />
              <Skeleton height={112} radius={14} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { gap: 16, paddingVertical: 20 },
  item: { gap: 14, paddingVertical: 12 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
