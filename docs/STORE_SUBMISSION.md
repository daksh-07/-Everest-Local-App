# Everest Local — Store Submission Values

Use these public HTTPS pages for the initial App Store / Google Play submission:

- Support URL: `https://everest-local-app.vercel.app/support`
- Privacy Policy URL: `https://everest-local-app.vercel.app/privacy`
- Terms URL: `https://everest-local-app.vercel.app/terms`
- Account deletion URL: `https://everest-local-app.vercel.app/delete-account`

Native identifiers:

- iOS bundle identifier: `com.everestlocal.app`
- Android package: `com.everestlocal.app`
- Native URL scheme: `everestlocal`
- App version: `1.0.0`
- Production Android artifact: Android App Bundle (AAB)

Before submission, the operator must still complete store-console declarations that cannot be committed to source:

- Apple App Privacy answers and updated age-rating questionnaire.
- Google Play Data Safety, content rating and account-deletion declarations.
- Apple signing/APNs/App Store Connect record.
- Google Play App Signing, Firebase FCM V1 credentials and Google Maps Android key restrictions.
- Supabase Auth leaked-password protection.
- Physical signed-build testing on a real iPhone and real Play-services Android device.

The support/privacy/terms/deletion routes are public and must remain reachable without authentication. Account-specific support continues through the authenticated in-app support request flow.
