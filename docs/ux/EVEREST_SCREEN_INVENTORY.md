# Everest screen and component inventory — 28 October 2026

Source base: production `ed013dec`. 97 screen files and 53 component files enumerated anew. `_layout` and `+` infrastructure files are excluded from screen counts; the static route audit uses its own convention. No authenticated screen is marked tested merely because it exists. Full direct imports, API names and literal navigation candidates: [machine-readable inventory](route-component-inventory.json).

Customer tabs remain Home, Explore (`/social`), Activity, Messages and Account. Home exposes Shop, search, quote requests and Live; advanced business tools remain reachable from Today and controls. `lib/customer-pager.tsx`, `components/CustomerTabBar.tsx`, `components/BusinessTabBar.tsx`, `app/_layout.tsx` and route guards govern visibility and access. Literal references are not proof of reachable authorized UI.

`lib/experience.tsx` implements persisted DEFAULT (Everest), PULSE and CLASSIC tokens. `lib/theme-colors.ts` supplies light/dark colors. Supabase clients have web/native variants. Screen state uses React hooks, contexts and section-state helpers; no replacement state library was introduced.

| Route | Source | Area | Direct data dependencies | Fresh coverage |
|---|---|---|---|---|
| `/account` | `app/account.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/activity` | `app/activity.tsx` | Shared / customer | `bookings`, `orders`, `quotes`, `service_requests` | Inventory only; runtime not verified this pass |
| `/admin-operations` | `app/admin-operations.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/admin` | `app/admin.tsx` | Shared / customer | `admin_set_verification`, `businesses`, `driver_applications` | Inventory only; runtime not verified this pass |
| `/appearance` | `app/appearance.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/archive` | `app/archive.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/assistant` | `app/assistant.tsx` | Shared / customer | `assistant` | Inventory only; runtime not verified this pass |
| `/auth` | `app/auth.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/available-now` | `app/available-now.tsx` | Shared / customer | `business_availability`, `businesses`, `profiles` | Inventory only; runtime not verified this pass |
| `/booking` | `app/booking.tsx` | Shared / customer | `bookings`, `businesses`, `quotes`, `reviews`, `service_booking_payment_summary`, `service_payments` | Inventory only; runtime not verified this pass |
| `/bookings` | `app/bookings.tsx` | Shared / customer | `bookings` | Inventory only; runtime not verified this pass |
| `/business-automations` | `app/business-automations.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-availability` | `app/business-availability.tsx` | Business | `business_availability`, `business_booking_settings`, `services` | Inventory only; runtime not verified this pass |
| `/business-bookings` | `app/business-bookings.tsx` | Business | `bookings`, `service_payments` | Inventory only; runtime not verified this pass |
| `/business-calendar-integrations` | `app/business-calendar-integrations.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-calendar` | `app/business-calendar.tsx` | Business | `bookings`, `business_availability` | Inventory only; runtime not verified this pass |
| `/business-control` | `app/business-control.tsx` | Business | `orders`, `payouts`, `products`, `services` | Inventory only; runtime not verified this pass |
| `/business-crm-booking` | `app/business-crm-booking.tsx` | Business | `bookings` | Inventory only; runtime not verified this pass |
| `/business-crm-quote` | `app/business-crm-quote.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-crm` | `app/business-crm.tsx` | Business | `bookings`, `conversations`, `crm_opportunities` | Inventory only; runtime not verified this pass |
| `/business-customer` | `app/business-customer.tsx` | Business | `bookings`, `crm_notes`, `quotes`, `service_payments` | Inventory only; runtime not verified this pass |
| `/business-customers` | `app/business-customers.tsx` | Business | `bookings` | Inventory only; runtime not verified this pass |
| `/business-dashboard` | `app/business-dashboard.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-deal` | `app/business-deal.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-dm-automation` | `app/business-dm-automation.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-followers` | `app/business-followers.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-growth-p1` | `app/business-growth-p1.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-growth` | `app/business-growth.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-inbox` | `app/business-inbox.tsx` | Business | `conversations` | Inventory only; runtime not verified this pass |
| `/business-integrations` | `app/business-integrations.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-invite` | `app/business-invite.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-job` | `app/business-job.tsx` | Business | `bookings` | Inventory only; runtime not verified this pass |
| `/business-jobs` | `app/business-jobs.tsx` | Business | `bookings` | Inventory only; runtime not verified this pass |
| `/business-leads` | `app/business-leads.tsx` | Business | `list_my_business_opportunities`, `request-media`, `send_quote_for_business` | Inventory only; runtime not verified this pass |
| `/business-my-work` | `app/business-my-work.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-onboarding` | `app/business-onboarding.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-operations` | `app/business-operations.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-orders` | `app/business-orders.tsx` | Business | `deliveries`, `orders`, `request_delivery_for_order`, `update_order_status` | Inventory only; runtime not verified this pass |
| `/business-payouts` | `app/business-payouts.tsx` | Business | `marketplace_payout_ledger` | Inventory only; runtime not verified this pass |
| `/business-profile-edit` | `app/business-profile-edit.tsx` | Business | `businesses` | Inventory only; runtime not verified this pass |
| `/business-profile` | `app/business-profile.tsx` | Business | `businesses`, `products`, `reviews`, `services` | Inventory only; runtime not verified this pass |
| `/business-today` | `app/business-today.tsx` | Business | `bookings`, `businesses`, `conversations`, `crm_opportunities`, `crm_pipeline_stages`, `marketplace_payout_ledger`, `orders`, `quotes` | Inventory only; runtime not verified this pass |
| `/business-upgrade` | `app/business-upgrade.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business-verification` | `app/business-verification.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/business` | `app/business.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/cart` | `app/cart.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/chat-input-regression` | `app/chat-input-regression.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/connections` | `app/connections.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/create-clip` | `app/create-clip.tsx` | Shared / customer | `posts`, `profiles` | Inventory only; runtime not verified this pass |
| `/create-post` | `app/create-post.tsx` | Shared / customer | `posts`, `products`, `profiles`, `services` | Inventory only; runtime not verified this pass |
| `/create-story` | `app/create-story.tsx` | Shared / customer | `profiles` | Inventory only; runtime not verified this pass |
| `/create` | `app/create.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/customer-calendar` | `app/customer-calendar.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/delete-account` | `app/delete-account.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/delivery` | `app/delivery.tsx` | Shared / customer | `accept_delivery_assignment`, `assign_delivery_driver`, `deliveries`, `delivery_assignments`, `driver_applications`, `profiles`, `update_delivery_status` | Inventory only; runtime not verified this pass |
| `/driver-dashboard` | `app/driver-dashboard.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/driver-onboarding` | `app/driver-onboarding.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/driver-verification` | `app/driver-verification.tsx` | Shared / customer | `driver_applications`, `driver_documents`, `driver_status_history`, `driver_vehicles`, `driver_verifications`, `evaluate_driver_compliance`, `profiles` | Inventory only; runtime not verified this pass |
| `/edit-profile` | `app/edit-profile.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/everest-live` | `app/everest-live.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/external-businesses` | `app/external-businesses.tsx` | Shared / customer | `authorise_external_enquiry`, `external-discovery`, `profiles`, `record_external_business_selection`, `service_requests` | Inventory only; runtime not verified this pass |
| `/external-quotes` | `app/external-quotes.tsx` | Shared / customer | `external_enquiries`, `revoke_external_enquiry` | Inventory only; runtime not verified this pass |
| `/help` | `app/help.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/highlight` | `app/highlight.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/highlights` | `app/highlights.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/` | `app/index.tsx` | Shared / customer | `bookings`, `businesses`, `notifications`, `profiles`, `service_requests` | Live guest + fixture affected states |
| `/instant-book` | `app/instant-book.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/memberships` | `app/memberships.tsx` | Shared / customer | `businesses` | Inventory only; runtime not verified this pass |
| `/messages` | `app/messages.tsx` | Shared / customer | `business_members`, `businesses` | Inventory only; runtime not verified this pass |
| `/notification-settings` | `app/notification-settings.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/notifications` | `app/notifications.tsx` | Shared / customer | `mark_all_notifications_read`, `mark_notification_read`, `notifications` | Inventory only; runtime not verified this pass |
| `/opportunities` | `app/opportunities.tsx` | Business | `list_my_business_opportunities`, `send_quote_for_business` | Inventory only; runtime not verified this pass |
| `/orders` | `app/orders.tsx` | Shared / customer | `deliveries` | Inventory only; runtime not verified this pass |
| `/privacy` | `app/privacy.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/product-editor` | `app/product-editor.tsx` | Business | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/product` | `app/product.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/products` | `app/products.tsx` | Business | `products` | Inventory only; runtime not verified this pass |
| `/promote-post` | `app/promote-post.tsx` | Shared / customer | `posts` | Inventory only; runtime not verified this pass |
| `/public-user` | `app/public-user.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/quotes` | `app/quotes.tsx` | Shared / customer | `quotes`, `reviews`, `service_matches` | Inventory only; runtime not verified this pass |
| `/request` | `app/request.tsx` | Shared / customer | `opportunities`, `service_requests`, `services` | Inventory only; runtime not verified this pass |
| `/requests` | `app/requests.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/reviews` | `app/reviews.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/saved-searches` | `app/saved-searches.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/saved` | `app/saved.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/search` | `app/search.tsx` | Shared / customer | `opportunities`, `profiles`, `service_requests` | Live guest + fixture affected states |
| `/service-areas` | `app/service-areas.tsx` | Business | `add_service_area`, `service_areas` | Inventory only; runtime not verified this pass |
| `/services` | `app/services.tsx` | Business | `services` | Inventory only; runtime not verified this pass |
| `/settings` | `app/settings.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/share-result` | `app/share-result.tsx` | Shared / customer | `bookings`, `profiles`, `publish_verified_work_post` | Inventory only; runtime not verified this pass |
| `/shop` | `app/shop.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/social-privacy` | `app/social-privacy.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/social` | `app/social.tsx` | Shared / customer | `businesses`, `posts`, `public_profiles`, `verified_work_posts` | Inventory only; runtime not verified this pass |
| `/sound` | `app/sound.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/story` | `app/story.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/support` | `app/support.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |
| `/terms` | `app/terms.tsx` | Shared / customer | Through helpers / none inline | Inventory only; runtime not verified this pass |

## Component inventory

Every component below was enumerated, not individually interaction-tested. Inspect the JSON for its direct shared dependencies.

| Component | Lines |
|---|---|
| `components/AmbientEdge.tsx` | 100 |
| `components/AppleSubscriptionControls.ios.tsx` | 132 |
| `components/AppleSubscriptionControls.tsx` | 5 |
| `components/AskEverestButton.tsx` | 17 |
| `components/AuthRolePicker.tsx` | 60 |
| `components/BusinessOperationsPrimitives.tsx` | 19 |
| `components/BusinessOpportunityAlert.tsx` | 181 |
| `components/BusinessTabBar.tsx` | 70 |
| `components/ClipEditor.tsx` | 116 |
| `components/ClipPlayer.tsx` | 97 |
| `components/CrmDateTimeField.native.tsx` | 18 |
| `components/CrmDateTimeField.tsx` | 18 |
| `components/CrmDateTimeField.web.tsx` | 13 |
| `components/CustomerLocationSelector.tsx` | 59 |
| `components/CustomerTabBar.tsx` | 51 |
| `components/DateTimeField.native.tsx` | 12 |
| `components/DateTimeField.tsx` | 12 |
| `components/DateTimeField.web.tsx` | 18 |
| `components/EverestLiveMiniPlayer.tsx` | 173 |
| `components/GlobalSwipeNavigator.tsx` | 118 |
| `components/LiveSearchMap.native.tsx` | 64 |
| `components/LiveSearchMap.tsx` | 17 |
| `components/LiveSearchMap.web.tsx` | 71 |
| `components/ModeSwitcher.tsx` | 53 |
| `components/MusicPicker.tsx` | 60 |
| `components/OperationalFeedback.tsx` | 10 |
| `components/PagerAwareScrollView.tsx` | 17 |
| `components/PhotoSoundPreview.tsx` | 65 |
| `components/PostCommentsSheet.tsx` | 170 |
| `components/PostMediaImage.tsx` | 17 |
| `components/PostSoundPlayer.tsx` | 65 |
| `components/PwaInstallPrompt.tsx` | 115 |
| `components/ReportPostSheet.tsx` | 76 |
| `components/SectionStatus.tsx` | 11 |
| `components/ServiceCategoryGrid.tsx` | 37 |
| `components/ServicePicker.tsx` | 453 |
| `components/SettingsRow.tsx` | 10 |
| `components/SoundPicker.tsx` | 169 |
| `components/ui/AppButton.tsx` | 64 |
| `components/ui/AppCard.tsx` | 11 |
| `components/ui/AppText.tsx` | 30 |
| `components/ui/AppTextInput.tsx` | 16 |
| `components/ui/ConfirmSheet.tsx` | 39 |
| `components/ui/ContentSkeleton.tsx` | 15 |
| `components/ui/EmptyState.tsx` | 25 |
| `components/ui/ErrorBanner.tsx` | 23 |
| `components/ui/Icon.tsx` | 18 |
| `components/ui/LoadingState.tsx` | 12 |
| `components/ui/MotionPressable.tsx` | 36 |
| `components/ui/ScreenHeader.tsx` | 51 |
| `components/ui/SectionHeader.tsx` | 24 |
| `components/ui/Skeleton.tsx` | 8 |
| `components/ui/StatusBadge.tsx` | 16 |
