# Google Play Billing Implementation

## Implementation Order

1. Apply database migrations through Supabase, including `20260605_billing_subscriptions.sql` and `20260609_google_play_billing_complete.sql`.
2. Enable Google Play Developer API in Google Cloud and create a service account for server-side purchase verification.
3. Grant the service account access in Play Console under API access.
4. Configure backend environment variables:
   - `BILLING_ENABLED=true`
   - `GOOGLE_PLAY_PACKAGE_NAME=com.nameisrk.pikadecks`
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64=<base64 service account json>`
   - `GOOGLE_PLAY_RTDN_SECRET=<shared secret for Pub/Sub push header>`
5. Configure frontend environment:
   - `EXPO_PUBLIC_ENABLE_BILLING=true`
   - `EXPO_PUBLIC_API_URL=<backend url>`
6. Deploy backend, then publish an Android build to an internal testing track.
7. Test purchase, restore, cancellation, renewal, expiry, and RTDN delivery before production rollout.

## Product Setup

- Product ID: `pikadecks_pro_monthly`
- Base plan ID: `monthly`
- Package name: `com.nameisrk.pikadecks`
- Billing library: `react-native-iap`
- Verification endpoint: `POST /billing/verify-subscription`
- RTDN endpoint: `POST /billing/google-play/rtdn`

## Backend

The backend verifies every purchase using Google Play Developer API `purchases.subscriptionsv2.get`.
The frontend sends `productId`, `purchaseToken`, and `packageName`; the backend rejects unsupported products, package mismatches, and replayed tokens assigned to another user.

RTDN Pub/Sub push requests are accepted at `/billing/google-play/rtdn`.
Configure Pub/Sub push to send header `x-pikadecks-rtdn-secret` with `GOOGLE_PLAY_RTDN_SECRET`.

## Database

`user_subscriptions` stores:

- `user_id`
- `plan_type`
- `purchase_token`
- `purchase_token_sha256`
- `subscription_id`
- `purchase_date`
- `expiry_date`
- `auto_renewing`
- `active`
- `created_at`
- `updated_at`

`billing_events` stores raw Google Play notification payloads for audit and replay diagnosis.

## Entitlements

Free plan:

- 10 AI generations per rolling 24-hour server window
- PDFs up to 150 pages
- Shared free quota across PDF, YouTube, and notes generation

Pro plan:

- Unlimited flashcard generation
- Unlimited PDF processing
- Unlimited YouTube flashcards
- Priority processing flag available through `plan_type='pro'`

## Testing Checklist

- Add tester email under Play Console license testers.
- Publish a signed Android build to Internal testing.
- Install only from the Play Store internal testing link.
- Confirm product fetch returns `pikadecks_pro_monthly`.
- Purchase monthly subscription.
- Confirm backend marks `users.plan_type='pro'`.
- Confirm `user_subscriptions.active=true`.
- Open `/subscription` and verify Pro status.
- Tap Restore purchases after reinstall/sign-in.
- Cancel in Play Store and confirm RTDN updates `auto_renewing=false` or status.
- Let sandbox subscription expire and confirm status becomes expired/free.

## Production Checklist

- Rotate and store service account JSON securely.
- Use base64 env var for Lambda deploys.
- Set `BILLING_ENABLED=true`.
- Set `EXPO_PUBLIC_ENABLE_BILLING=true`.
- Verify RTDN Pub/Sub push succeeds with 2xx responses.
- Monitor `billing_events` and `user_subscriptions`.
- Confirm Firebase Analytics receives:
  - `subscription_viewed`
  - `subscription_started`
  - `subscription_purchased`
  - `subscription_failed`
  - `subscription_cancelled`
  - `subscription_renewed`
