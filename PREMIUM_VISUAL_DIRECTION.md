# Everest Local — Premium Visual Direction

This brief is additive to the current motion / UI overhaul. It is intended to stop the app from drifting into either of these two extremes:

1. generic AI-app UI — pills, borders, icon circles, rounded cards everywhere;
2. editorial/luxury landing-page UI — decorative serif headlines and visual motifs that compete with product usability.

The target is a premium **local operating system**: calm, fast, specific, recognisable as Everest, and built around real local activity.

## Core rule

**Most information should sit directly on the canvas. Cards are reserved for things that are actually objects.**

A business, booking, product, request, post or conversation may deserve a surface.
A heading, navigation choice, status label or simple action usually does not.

Do not solve hierarchy by wrapping everything in another rounded rectangle.

## Brand language

Keep:
- deep black / warm charcoal environment
- warm off-white text
- champagne / beige as the primary Everest brand colour
- moss green only for live / available / positive status
- restrained typography and motion

Avoid:
- orange replacing champagne as the main CTA colour
- random accent colours
- giant uppercase labels everywhere
- repeated icon-in-dark-circle treatment
- borders around every block
- one shared border radius across the whole app

### Everest-specific visual motif

A subtle topographic / contour-line language can become an Everest signature, but it must be restrained:
- use it as atmosphere, not content;
- never run contour lines through important text, inputs or buttons;
- keep contrast very low;
- clip it to hero / live / map / empty-state regions;
- do not add literal mountains everywhere.

The product should feel geographically aware without becoming a mountain-themed app.

## Typography

Do not turn the product into an editorial magazine.

If a display face is used, use it sparingly for one strong moment. Most product UI should remain an excellent modern sans system with clear hierarchy.

Hierarchy should come from:
- size
- weight
- line-height
- alignment
- whitespace

not from uppercase labels and boxes.

## Home — required direction

Home should feel like a **local operating system**, not a landing page and not a dashboard.

Suggested hierarchy:

EVEREST / location / account affordance

Primary question:
"What do you need today?"

Universal search:
"Search services, businesses or products"

Immediate actions:
- Need someone now
- Request quotes

These should feel like direct actions, not two oversized dashboard cards.

If Everest Live has a real count, show a concise line such as:
"6 businesses available nearby"

Never fabricate activity. Any copy like:
"Three detailers replied near Rooty Hill this week"
must only render if backed by real marketplace data.

### Active work

Current booking / request context should be compact and operational.

Example:
"Detailing · Waiting for quotes        2 replies →"

Do not spend 180–220px of vertical space on one status card unless the user needs that space to act.

### Content flow

After primary actions, move quickly into real content:
- Near you
- Local today
- Shop nearby

Prefer horizontally browsable shelves and content-first sections.

The social composer should not be a giant empty card. A compact "+ Post" / share affordance near the local feed is enough.

### Trust

Do not use the generic three-icon trust row:
Verified / Local / Secure

Prefer a concise, specific product claim when it is true, for example:
"Verified businesses. Payments stay in Everest until the job is complete."

Use one calm treatment, not three decorative badges.

## Navigation

The bottom navigation should be visually quiet.

Avoid:
- giant capsule surrounding the entire nav;
- filled circles or pills behind every active icon;
- independent nav animations that happen after page movement.

Preferred:
- subtle elevated/blurred base or near-borderless base;
- icon + label hierarchy;
- thin champagne indicator or underline;
- active state derived from actual pager progress.

During Home → Explore:
- Home emphasis should continuously decrease;
- Explore emphasis should continuously increase;
- indicator should interpolate with the same pager progress;
- no delayed spring after route completion.

Navigation must feel like one physical system.

## Messages — must be visibly redesigned

The Messages screen should look substantially different after this pass. Do not stop at padding changes, skeletons or one extra button.

### Messages home

Header:
Messages                           Search / Compose

Then a subtle segmented control:
Chats | Requests

Search should be a calm, large surface with minimal border treatment.

Conversation rows:
- 56–60px avatar;
- strong name hierarchy;
- latest message clearly secondary;
- timestamp aligned cleanly;
- unread state visible without shouting;
- compact unread badge;
- no divider after every single row unless density requires it;
- no giant rounded card per conversation.

Business context should appear as subtle metadata:
"Product · Ceramic coating"
"Service · Mobile detailing"

Do not stamp "BUSINESS" loudly under every business row.

### Message thread

Header:
- back
- avatar
- name
- useful context / state
- menu

Bubbles:
- better grouping;
- cleaner geometry;
- natural max width;
- more breathing room between groups;
- integrated reply preview;
- restrained reactions;
- clean sent / delivered / seen;
- graceful sending / failed / deleted states.

### Swipe to reply

On mobile:
- bubble follows finger slightly;
- reply affordance appears;
- threshold crossing gives haptic feedback once;
- release over threshold starts reply;
- cancel springs back.

### Composer

Composer should feel attached to the keyboard, not like a floating form control.

Requirements:
- smooth keyboard transitions;
- multiline growth without layout jumps;
- reply/edit state integrated above;
- subtle input surface;
- send affordance that activates naturally;
- correct safe-area behaviour.

Avoid JS-thread-heavy border/shadow animation while typing.

## Account / Profile

Profile should feel like a social identity, not an account dashboard.

Preserve:
- profile photo
- name
- bio
- website
- Posts / Connections / Following
- customer/business state
- posts
- promotion

Reduce:
- oversized enclosing cards
- borders around every section
- dashboard-style metric boxes

Stats should feel integrated with profile identity.

Post gallery should prioritise real media and captions.

## Explore

Posts and Clips should feel like two surfaces of one Explore experience.

- content-first layout;
- Posts / Clips indicator tied to pager progress;
- stories rail should not dominate;
- author metadata should be compact;
- media gets visual priority;
- comments/reactions should feel native and light.

Do not add decorative chrome around every post.

## Motion

Motion should explain continuity, not decorate.

Use:
- direct manipulation
- velocity-aware settling
- shared progress
- restrained haptics
- minimal press scale
- native-feeling sheets

Avoid:
- bouncing
- slow fades
- giant scale changes
- route-swap animation after gesture ends
- React state updates every gesture frame
- continuous runOnJS during panning

## Visual acceptance criteria

Before calling this pass complete:

1. A screenshot of Home should not look like a generic card dashboard.
2. A screenshot of Messages should be obviously redesigned, not merely restyled.
3. The app should use fewer visible borders and pills than commit 4648c50.
4. Champagne remains the Everest primary accent; moss is semantic for live/available.
5. Decorative topography never competes with readable content.
6. No fake local activity, fake counts, fake online state or fake demand.
7. Navigation active state is continuous with pager motion.
8. Consumer screens should feel calmer and less boxed-in than business/admin screens.
9. Every visual treatment must have a hierarchy purpose; remove decoration that exists only to fill space.
10. Preserve all existing production logic, data authority, RLS, payments, dispatch, verification and marketplace flows.
