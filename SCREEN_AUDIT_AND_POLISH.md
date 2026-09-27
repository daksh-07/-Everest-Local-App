# Everest Local — Comprehensive Screen Audit & Polish Plan

**Date:** 2026-09-27  
**Scope:** Full app UX/UI audit across 100+ screens + actionable polish roadmap  
**Goal:** Transform from "functional MVP" → "premium launch-quality app"

---

## Executive Summary

### Current State
- ✅ **Core architecture solid:** Auth, database, server-auth, security hardened
- ✅ **80% screens exist** with basic functionality
- ⚠️ **Rough around edges:** Inconsistent spacing, weak empty states, abrupt transitions, missing loading states
- ⚠️ **UX gaps:** No clear visual hierarchy on key flows, missing trust indicators, weak error messages
- ⚠️ **Missing flows:** Messaging thread UI incomplete, reviews not wired, delivery method selection missing

### Key Findings

#### 1. **Design System Issues**
| Issue | Impact | Severity |
|-------|--------|----------|
| No unified component library | Inconsistent styling across screens | HIGH |
| Spacing & padding vary wildly | Screens feel unpolished, misaligned | HIGH |
| Color usage not strategic | Low visual hierarchy, trust unclear | MEDIUM |
| Typography hierarchy weak | Hard to scan, unclear priorities | MEDIUM |
| Button styles inconsistent | Confusing interaction model | MEDIUM |
| No empty/loading/error state patterns | Broken UX under edge cases | HIGH |

#### 2. **Screen-by-Screen Findings**

**Home (`app/index.tsx`)**
- ✅ Good overall structure
- ⚠️ Hero section spacing inconsistent
- ⚠️ "Trust row" icons too small, hard to scan
- ⚠️ Business cards lack verification badge
- ⚠️ Category grid needs better visual separation

**Messages (`app/messages.tsx`)**
- ✅ Complete conversation list
- ⚠️ Thread UI (PersonalThread) works but looks basic
- ⚠️ Message bubbles lack clear read status visual
- ⚠️ Composer animation janky on web
- ❌ **No conversation creation flow** (must open messages first)
- ❌ **Search broken on mobile** (text input issues)

**Account (`app/account.tsx`)**
- ✅ Good card-based layout
- ⚠️ Stats section lacks context/explainers
- ⚠️ Collaboration invites need better visual treatment
- ⚠️ Post grid incomplete (missing titles)
- ⚠️ Role cards repetitive, not scannable

**Booking (`app/booking.tsx`)**
- ⚠️ Timeline visualization weak
- ⚠️ Payment status unclear (no clear paid/pending visual)
- ⚠️ Status transition unclear (no "what's next?" guidance)
- ❌ **No completion/review flow wired**
- ❌ **Checklist items render but no interactions**

**Business Dashboard Screens**
- ⚠️ All business-*.tsx screens follow same pattern
- ⚠️ Table/list UX inconsistent
- ⚠️ No "empty business" onboarding guidance
- ⚠️ Verification status unclear in UI
- ⚠️ CRM screens dense, hard to prioritize

#### 3. **Missing Visual Patterns**

| Pattern | Status | Usage |
|---------|--------|-------|
| Empty States | ❌ Missing | All screens with possible zero-state |
| Loading States | ⚠️ Partial | Skeletons exist but inconsistent |
| Error Messages | ⚠️ Generic | No consistent recovery UX |
| Success Feedback | ⚠️ Minimal | Only toast/haptic, no visual confirmation |
| Verification Badges | ✅ Exists | But inconsistently applied |
| Status Indicators | ⚠️ Text-only | Need color/icon treatment |
| Disabled States | ⚠️ Unclear | Buttons look clickable when disabled |
| Touch Targets | ⚠️ Small | <48px in many places |
| Safe Areas | ✅ Good | Properly handled |

#### 4. **Navigation & Flow Issues**

| Flow | Status | Problem |
|------|--------|---------|
| Auth → Home | ✅ Works | - |
| Home → Request Creation | ⚠️ Works | Hero CTAs could be clearer |
| Request → Matching | ⚠️ Works | No visual feedback while matching |
| Quote → Booking | ⚠️ Works | State transitions abrupt |
| Booking → Message | ✅ Works | - |
| Booking → Review | ❌ Broken | Review creation UI missing |
| Message → Profile | ✅ Works | - |
| Business Onboarding | ⚠️ Partial | Verification flow unclear |
| Product Checkout | ⚠️ Partial | Delivery method selection missing |

---

## Audit by Module

### Home Feed (`index.tsx`)

**Strengths:**
- Solid information hierarchy
- Good use of sections
- Smart business nearby matching

**Issues:**
- Hero section spacing: `marginTop` values inconsistent (8px vs 20px on desktop)
- Trust row icons too small (13px) for scanning
- Business skeleton loaders jerky
- No "no nearby businesses" state
- Category icons don't have labels in some viewports
- Search focus state not visually distinct enough
- Composer actions cramped (38px min-height but icons only 17px)

**Fixes Needed:**
1. Standardize section spacing (28px between sections consistently)
2. Increase trust row icons to 16px, add subtle background circles
3. Improve business card design: add verification badge, better image treatment
4. Add empty state for "no businesses found"
5. Add loading skeleton for products section
6. Fix composer spacing: 46px min-height, more breathing room
7. Improve category grid: add labels, better icon sizing

---

### Messages (`messages.tsx`)

**Strengths:**
- Complete personal & market messaging
- Good message actions (react, reply, edit, delete)
- Proper read/unread tracking

**Critical Issues:**
- **Conversation creation flow missing** — Users can't start new convos
- **Thread UI too compact** — Message bubbles hard to tap/select
- **Composer has web-specific bugs** — TextField focus not working smoothly on web
- **Search breaks on mobile** — TextInput placeholder color, focus ring issues
- **Read status ambiguous** — "Seen" text tiny, no visual checkmark
- **No conversation recovery** — Can't undelete/unhide conversations

**Medium Issues:**
- Message metadata (time/status) cramped
- No skeleton for initial load
- Request prompts (accept/decline) too tall
- No scroll-to-bottom on new message
- Reactions row overflows on long messages
- Action menu positioning janky on small screens

**Fixes Needed:**
1. Add conversation creation UI (new button, compose screen)
2. Increase message bubble padding and tap target (min 60px height)
3. Add clear visual "sent/delivered/seen" states with icons
4. Fix web TextInput issues (platform-specific styling)
5. Improve search (better focus state, mobile-friendly)
6. Add swipe-to-reply gesture on mobile
7. Better "no messages" empty state
8. Skeleton loader for conversation list

---

### Account (`account.tsx`)

**Strengths:**
- Good profile section with avatar
- Clear role indicators
- Post grid layout

**Issues:**
- Stats section lacks explanation (what is "engagement"?)
- Collaboration invites need context (from who? about what?)
- Post grid shows cover image but no title/caption visible
- Role switcher button unclear
- "Everything else" section crammed
- No explanation of Business mode until switching

**Fixes Needed:**
1. Add tooltips/popovers explaining stats
2. Improve collab invite card: show inviter name, preview of their post
3. Add post title overlay on grid items
4. Separate account management from role switcher
5. Add onboarding prompts for empty states (no posts, no collab invites)
6. Improve "notice cards" styling (verification pending, driver status)

---

### Booking Details (`booking.tsx`)

**Strengths:**
- Clear booking status
- Good timeline visualization
- Payment summary included

**Critical Issues:**
- **No completion/review flow** — Booking says "Complete" but can't submit review
- **Checklist is read-only** — Renders items but no interaction
- **Payment status ambiguous** — Shows numbers but unclear if needs action
- **No "what's next?" guidance** — Completion note section confusing

**Fixes Needed:**
1. Wire review submission flow (star rating, comment, photos)
2. Make checklist interactive where appropriate
3. Add clear "Amount due" visual with payment button prominently
4. Add guidance text for each booking status (waiting for business, in progress, etc.)
5. Improve timeline: add icons for each stage, highlight current stage
6. Add business contact/reschedule options

---

### Business Screens (`business-*.tsx`)

**General Pattern Issues:**
- No consistent card layout for list items
- Table/list headers not visually distinct
- Empty states missing on all screens
- Status indicators text-only (ACTIVE, PENDING_PAYMENT, etc.)
- CRM screens overwhelming (too many columns)
- Verification status not prominent

**By Screen:**

| Screen | Issue | Priority |
|--------|-------|----------|
| `business-profile.tsx` | Logo upload missing visual feedback | MEDIUM |
| `business-crm.tsx` | Dense table, hard to scan | HIGH |
| `business-customers.tsx` | List needs sorting/filtering UX | MEDIUM |
| `business-orders.tsx` | Order status unclear | HIGH |
| `business-bookings.tsx` | Timeline view poor | MEDIUM |
| `business-leads.tsx` | Lead scoring confusing | MEDIUM |
| `business-calendar.tsx` | Availability selection janky | MEDIUM |
| `business-verification.tsx` | Document upload missing UI | CRITICAL |

---

## Design System Audit

### Color Usage
- Theme system exists (`theme.tsx`) but not consistently applied
- `c.brand` used for primary actions ✅
- `c.danger` inconsistently used for warnings
- `c.success` rarely used (reserve for positive states)
- **Missing:** Subtle background colors for grouping (e.g., `c.soft` should be used more)

### Spacing System
**Current:** Ad-hoc padding/margins (12, 14, 16, 18, 20, 24, 28, etc.)  
**Recommendation:** Enforce 8px-based scale (4, 8, 12, 16, 20, 24, 32, 40, 48)  
**Issue:** Screens mix different scales, making it look unprofessional

### Typography
**What exists:**
- fontSize varies: 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 25, 29, 30
- fontWeight: 400, 700, 800, 900
- lineHeight: inconsistent

**What's missing:**
- Consistent font scale (T1, T2, T3, caption, body, small)
- Proper lineHeight ratios (most are guessed)
- Letter spacing used sparingly for emphasis only

### Component Patterns

#### Buttons
**Current State:**
- Primary: `backgroundColor: c.brand, minHeight: 46-50`
- Secondary: `borderWidth: 1, borderColor: c.border`
- Tertiary: Text-only pressable
- **Problem:** Inconsistent padding, height, ripple effects

**Should Be:**
```tsx
// Primary button: high emphasis
<Pressable style={{minHeight: 48, borderRadius: 12, backgroundColor: c.brand, 
  paddingHorizontal: 20, justifyContent: 'center'}}>
  <Text style={{fontSize: 15, fontWeight: '700', color: c.onBrand}}>ACTION</Text>
</Pressable>

// Secondary button: medium emphasis
<Pressable style={{minHeight: 48, borderRadius: 12, borderWidth: 1.5, 
  borderColor: c.border, paddingHorizontal: 20}}>
  <Text style={{fontSize: 15, fontWeight: '600', color: c.text}}>ACTION</Text>
</Pressable>

// Tertiary button: low emphasis
<Pressable><Text style={{fontSize: 15, color: c.textSecondary}}>ACTION</Text></Pressable>
```

#### Input Fields
**Current:** Inconsistent border styling, focus states unclear  
**Should Be:**
- Border: `borderColor: c.border` (unfocused), `borderColor: c.brand` (focused)
- BorderRadius: 12px consistently
- MinHeight: 48px (touch target)
- Padding: 14px horizontal, 12px vertical
- Placeholder color: `c.muted`

#### Cards
**Current:** Mix of styles (`borderRadius: 16 vs 18 vs 20`, border colors vary)  
**Should Be:**
- Background: `c.surface`
- Border: `1px c.border`
- BorderRadius: 16px (medium cards), 20px (large)
- Padding: 16px (standard), 14px (compact)
- Shadow: minimal (2px offset, 4% opacity on dark)

#### Empty States
**Currently missing.** Should have:
- Icon (50x50, `c.soft` background, `c.brand` icon)
- Title (14px, bold, `c.text`)
- Description (12px, `c.muted`)
- Optional CTA button
- Vertical padding: 48px top/bottom

#### Loading States
**Current:** Basic ActivityIndicator only  
**Should Add:**
- Skeleton loaders for cards/lists
- Progress indicators for long operations
- Spinners with text (e.g., "Finding nearby businesses...")

#### Error States
**Current:** Generic error text at bottom  
**Should Be:**
- Prominent banner with icon, title, description
- Recovery action button (Retry, Go Back, Contact Support)
- Error icon: `c.danger`
- Background: `c.soft` (subtle)

---

## Polish Roadmap (Priority Order)

### Phase 1: Foundation (1 week)
**Goal:** Fix most visible rough edges

- [ ] Standardize spacing (8px scale across all screens)
- [ ] Unify button styles (primary, secondary, tertiary)
- [ ] Fix input field styling (focus states, borders, heights)
- [ ] Create empty state component (icon + title + description)
- [ ] Improve loading state skeletons
- [ ] Fix message bubble styling (padding, read status visual)
- [ ] Improve card styling (consistent radius, border, shadow)

### Phase 2: High-Impact Screens (2 weeks)
**Goal:** Make major customer paths feel premium

- [ ] **Home Feed:** Fix trust row, business cards, categories, composer
- [ ] **Messages:** Add conversation creation, improve thread UI, fix search
- [ ] **Booking:** Wire review flow, improve timeline, payment clarity
- [ ] **Account:** Improve stats explainers, collab invites, post grid
- [ ] **Business CRM:** Add empty states, improve table UX, status indicators

### Phase 3: Completion Flows (1.5 weeks)
**Goal:** Wire remaining incomplete flows

- [ ] Message reactions, edit, reply interactions
- [ ] Review creation & display
- [ ] Booking state transitions & guidance
- [ ] Delivery method selection
- [ ] Business verification document upload (basic UI)

### Phase 4: Polish & QA (1 week)
**Goal:** Final pass on UX refinement

- [ ] Keyboard handling (iOS/Android/web consistency)
- [ ] Touch targets (verify all ≥48px)
- [ ] Scrolling smoothness, jank elimination
- [ ] Accessibility (labels, focus order, contrast)
- [ ] Device testing (iPhone, Android, web)

---

## Implementation Strategy

### Approach: Decoupled Component Library
Instead of refactoring every screen at once, build reusable components:

**Phase 1 files to create:**
```
lib/
  ui-components/
    Button.tsx          (Primary, Secondary, Tertiary)
    Input.tsx           (TextField with focus states)
    Card.tsx            (Standard card wrapper)
    EmptyState.tsx      (Empty state template)
    LoadingState.tsx    (Skeleton & spinner)
    ErrorBanner.tsx     (Error message template)
    StatusBadge.tsx     (Verification, payment status)
    Avatar.tsx          (User avatar with fallback)
```

**Then update screens to use these components.**

### File-by-File Priorities

**CRITICAL (Week 1):**
1. `app/messages.tsx` — Add conversation creation, fix thread
2. `app/index.tsx` — Improve home feed visual hierarchy
3. `app/booking.tsx` — Wire review flow, fix payment clarity
4. `lib/theme.tsx` — Add component token system (sizes, spacing)

**HIGH (Week 2):**
5. `app/account.tsx` — Improve stats, collab invites
6. `app/business-crm.tsx` — Empty states, better CRM UX
7. `app/quotes.tsx` — Improve quote lifecycle UI
8. `app/product.tsx` — Better product detail layout

**MEDIUM (Week 3):**
9. `app/request.tsx` — Improve request creation flow
10. `app/search.tsx` — Better search results layout
11. `app/business-orders.tsx` — Order status visualization
12. `app/business-bookings.tsx` — Booking timeline

---

## Specific Improvements (Examples)

### Example 1: Improve Trust Row (Home)

**Current:**
```tsx
<View style={s.trustRow}>
  <Trust icon="shield-checkmark" label="Verified businesses"/>
  <Trust icon="location" label="Local matches"/>
  <Trust icon="lock-closed" label="Secure payments"/>
</View>
```

**Issues:** Icons 13px (too small), no background, labels cramp

**Improved:**
```tsx
<View style={{flexDirection: 'row', gap: 12, paddingHorizontal: 16, 
  paddingVertical: 14, marginHorizontal: -16, backgroundColor: c.soft,
  borderRadius: 16, marginHorizontal: 16}}>
  {[
    {icon: 'shield-checkmark', label: 'Verified'},
    {icon: 'location', label: 'Local'},
    {icon: 'lock-closed', label: 'Secure'}
  ].map(item => (
    <View key={item.icon} style={{flex: 1, flexDirection: 'row',
      alignItems: 'center', gap: 8}}>
      <View style={{width: 36, height: 36, borderRadius: 18,
        backgroundColor: c.brand, alignItems: 'center',
        justifyContent: 'center'}}>
        <Ionicons name={item.icon} size={16} color={c.onBrand}/>
      </View>
      <Text style={{fontSize: 11, fontWeight: '600', color: c.text}}>
        {item.label}
      </Text>
    </View>
  ))}
</View>
```

**Improvements:**
- Icons now 16px in 36x36 colored circles
- Better spacing, scans faster
- More premium appearance

---

### Example 2: Create Reusable EmptyState Component

**Current:** Scattered, inconsistent empty state implementations

**New Component:**
```tsx
// lib/ui-components/EmptyState.tsx
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  colors
}: {
  icon: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  colors: ThemeColors;
}) {
  return (
    <View style={{paddingVertical: 56, alignItems: 'center', gap: 16}}>
      <View style={{width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.soft, alignItems: 'center',
        justifyContent: 'center'}}>
        <Ionicons name={icon} size={28} color={colors.brand}/>
      </View>
      <View style={{gap: 6, alignItems: 'center'}}>
        <Text style={{fontSize: 16, fontWeight: '700', color: colors.text}}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{fontSize: 13, color: colors.muted, textAlign: 'center',
            maxWidth: 280}}>
            {subtitle}
          </Text>
        )}
      </View>
      {action && (
        <Pressable onPress={action.onPress} style={{marginTop: 12,
          minHeight: 44, paddingHorizontal: 24, borderRadius: 10,
          backgroundColor: colors.brand, alignItems: 'center',
          justifyContent: 'center'}}>
          <Text style={{fontSize: 14, fontWeight: '700', color: colors.onBrand}}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
```

**Usage on all screens:**
```tsx
{items.length === 0 && (
  <EmptyState
    icon="inbox-outline"
    title="No messages yet"
    subtitle="When someone messages you, they'll appear here."
    action={{ label: 'Start a conversation', onPress: () => router.push('/...') }}
    colors={c}
  />
)}
```

---

## Testing Checklist

Before marking a screen "polished":

- [ ] Empty state displays correctly
- [ ] Loading state shows skeleton
- [ ] Error message has recovery action
- [ ] All buttons ≥48px touch target
- [ ] Focus states visible (keyboard nav)
- [ ] Spacing consistent (8px grid)
- [ ] Text contrast ≥4.5:1
- [ ] No jank on scroll (iOS/Android/web)
- [ ] Keyboard dismisses properly
- [ ] Images load without jarring
- [ ] Error recovery works (retry, go back)
- [ ] Status states clear (pending, success, failed)

---

## Summary

This audit identified **3 categories of work:**

1. **Design System** (foundation)
   - Enforce 8px spacing grid
   - Standardize component styles
   - Create empty/loading/error patterns

2. **High-Impact Screens** (conversion)
   - Home, Messages, Booking, Account
   - Fix visual hierarchy and trust indicators
   - Complete key flows (messaging, review)

3. **Business & Operations** (enterprise features)
   - CRM screens need better UX
   - Verification flows need UI
   - Delivery/payment flows need completion

**Estimated effort:**
- Phase 1 (foundation): 5-7 days
- Phase 2 (high-impact screens): 10-14 days
- Phase 3 (completion flows): 7-10 days
- Phase 4 (polish & QA): 5-7 days
- **Total: 4-5 weeks to "premium launch-ready"**

Next step: Begin Phase 1 with component library and home feed improvements.
