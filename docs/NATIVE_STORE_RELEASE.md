# Everest Local — Native Store Release Gate

This document is the authoritative native release checklist for the App Store and Google Play builds.

## Code-enforced invariants

- iOS bundle identifier: `com.everestlocal.app`
- Android package: `com.everestlocal.app`
- Custom scheme: `everestlocal`
- Production Android output: AAB
- Production build numbers: EAS remote auto-increment
- iOS notification entitlement: production APNs
- Android notification channel: `everest-live`
- Android notification icon: white transparent native asset
- Android edge-to-edge enabled
- Android keyboard mode: resize
- iPad support is disabled until tablet UX is physically certified
- Native Everest Pro purchases never fall back to Stripe. Web can use Stripe; native digital billing requires store-native billing.
- Production Android EAS builds fail closed when Firebase or Google Maps native configuration is missing.

## EAS project

Before the first production build, link this repository to the one Everest Local EAS project. Native push registration requires the EAS project id exposed by the resulting EAS build. Do not hard-code or invent a project id in source.

## iOS production credentials

Required in the Apple Developer / EAS credential setup:

1. App identifier `com.everestlocal.app`.
2. Push Notifications capability enabled for that identifier.
3. Valid App Store distribution signing certificate and provisioning profile.
4. APNs key configured in EAS credentials.
5. App Store Connect record for Everest Local.
6. If Everest Pro purchasing is enabled inside iOS later, configure the App Store subscription product and enable `EXPO_PUBLIC_ENABLE_APPLE_IAP=true` only after server verification credentials are live.

The current store build does not expose Stripe checkout for Everest Pro on iOS.

## Android production credentials

Required in the Firebase / Google Cloud / EAS / Play setup:

1. Firebase Android app registered for `com.everestlocal.app`.
2. Firebase `google-services.json` supplied to EAS as a File environment variable named `GOOGLE_SERVICES_JSON` (or intentionally committed as `./google-services.json` if policy permits).
3. FCM V1 service-account credential uploaded to EAS credentials for the same Firebase project.
4. Google Maps Android SDK enabled.
5. A Google Maps Android API key supplied as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`.
6. Restrict the Maps key to package `com.everestlocal.app` and the Google Play app-signing SHA-1 certificate.
7. Google Play app record and Play App Signing configured.

The production EAS build hook refuses to build Android if the Firebase file or Maps key is missing.

## Automated native gates

Every relevant pull request and main-branch change runs:

- Expo config resolution
- clean iOS prebuild
- App Store bundle id / deep-link / production APNs entitlement checks
- iPhone-only device-family check
- native icon generation check
- clean Android prebuild
- Play package id check
- Android POST_NOTIFICATIONS permission check
- adaptive launcher / notification resource checks
- full Gradle `:app:bundleRelease` compilation
- output AAB existence check
- TypeScript, ESLint, security, migration, Expo Doctor and web-export checks

## Physical-device release gate

Automation cannot replace this final device matrix. Before public release, install signed production/preview builds on at least one real iPhone and one real Google Play Android device and verify:

- fresh install, sign-up, sign-in, sign-out, account switching and password recovery;
- customer mode and business mode switching;
- Everest Live foreground alert;
- Everest Live lock-screen push while app is backgrounded;
- push tap from a cold launch opens the intended opportunity;
- push permission denied and later enabled from system settings;
- Android Live map renders real map tiles;
- precise address remains hidden until the authorised booking stage;
- camera/photo picker, microphone/voiceover, location and calendar permissions;
- keyboard behavior and edge-to-edge safe areas;
- Stripe physical-service/product payments;
- business Stripe Connect onboarding/status;
- employee invitation email and employee invite acceptance;
- account deletion and legal pages;
- airplane-mode / reconnect recovery.

A powered-off device cannot receive a live alert until it reconnects; Everest Live must continue offering work to other eligible providers rather than reserving the job for that device.
