import { Ionicons as BaseIonicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IoniconsProps=ComponentProps<typeof BaseIonicons>;

/** Ionicons that stay out of the accessibility tree unless given their own label.
 * On web an icon renders as a private-use text glyph, which otherwise leaks into the
 * computed name of the surrounding button (" Connect"). Icons that carry meaning
 * on their own pass `accessibilityLabel` and remain exposed. */
function AccessibleIonicons(props:IoniconsProps){
  const labelled=Boolean(props.accessibilityLabel);
  return <BaseIonicons
    {...(labelled?{}:{accessibilityElementsHidden:true,importantForAccessibility:'no-hide-descendants' as const,'aria-hidden':true})}
    {...props}
  />;
}

export const Ionicons=Object.assign(AccessibleIonicons,{glyphMap:BaseIonicons.glyphMap});
