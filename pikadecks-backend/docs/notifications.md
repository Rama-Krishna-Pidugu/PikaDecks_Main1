# PikaDecks AWS Notification System

## What Runs Where

Notifications are AWS-only:

- AWS EventBridge triggers `notificationService` three times per day.
- AWS Lambda evaluates notification candidates and sends FCM pushes.
- The FastAPI backend registers device tokens and marks opened notifications.
- Supabase is used only as the database for notification tables.

Do not deploy Supabase Edge Functions or Supabase Cron for notifications.

## Database

Run these migrations in order:

1. `migrations/20260602_spaced_repetition.sql`
2. `migrations/20260602_notifications.sql`

The notification migration creates:

- `user_push_tokens`
- `notification_settings`
- `notification_logs`
- `user_achievements`
- `streak_tracking`

## AWS Lambda

The Serverless function is:

```txt
notificationService
```

Handler:

```txt
notificationservices/lambda_function.handler
```

Schedules:

- `MORNING`: 06:00 IST / 00:30 UTC, inactive daily reminder
- `MORNING`: 09:00 IST / 03:30 UTC, inactive daily reminder
- `AFTERNOON`: 13:35 IST / 08:05 UTC, due review reminder
- `AFTERNOON`: 14:00 IST / 08:30 UTC, due review reminder
- `AFTERNOON`: 15:00 IST / 09:30 UTC, due review reminder
- `AFTERNOON`: 17:00 IST / 11:30 UTC, due review reminder
- `STREAK_WARNING_1`: 20:00 IST / 14:30 UTC, streak protection
- `STREAK_WARNING_2`: 23:00 IST / 17:30 UTC, final streak protection
- `TEST_ALL`: manual non-production test that sends to active FCM tokens

Each run selects only the best notification per user for that time slot.
For each user and notification type, the message picker avoids repeating the
same title/body combination sent during the previous 24 hours.

Manual all-token test:

```txt
npx serverless invoke -f notificationService --stage test --data '{"job_type":"TEST_ALL","limit":10}'
```

Single-user test:

```txt
npx serverless invoke -f notificationService --stage test --data '{"job_type":"TEST_ALL","user_id":"SUPABASE_USER_UUID"}'
```

Omit `limit` only when you intentionally want to send to every active test token.
`TEST_ALL` is blocked when `SENTRY_ENVIRONMENT=production`.

## Environment

Set these backend deployment secrets:

```txt
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
S3_BUCKET=
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
CLERK_JWKS_URL=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
FCM_SERVICE_ACCOUNT_JSON=
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

`FCM_SERVICE_ACCOUNT_JSON` must contain the full Firebase service account JSON
or base64-encoded JSON. Prefer base64 for AWS Lambda because it avoids newline
damage in the private key.

Do not hash this value. Hashing is one-way and Lambda would not be able to
rebuild the service account. Use a secret value, preferably base64-encoded:

```powershell
$path = "C:\path\firebase-service-account.json"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) | Set-Clipboard
```

Paste that single-line value into `FCM_SERVICE_ACCOUNT_JSON` in local `.env`,
GitHub Actions secrets, and the deployed Lambda environment. Do not commit the
JSON file or the base64 value.

## Mobile Environment

Set in frontend `.env`:

```txt
EXPO_PUBLIC_API_URL=
```

Notification registration uses the AWS backend:

- `POST /notifications/device-token`
- `DELETE /notifications/device-token`
- `POST /notifications/opened`

The app sends the Clerk bearer token to these endpoints. It does not call
Supabase Edge Functions for notifications.

## Notification Rules

The Lambda applies spam protection:

- Maximum 3 total push notifications per user per day.
- Minimum 10 minutes between pushes for the same user in the current test setup.
- Only one notification is selected per user per Lambda run.
- Due review notifications require at least 10 due cards.

Time-slot behavior:

- Morning sends only inactive reminders.
- Afternoon sends only due review reminders.
- Evening sends only streak reminders.

## Deep Links

Notification targets:

- Daily review: `/home`
- Overdue review: `/home`
- Streak: `/stats`
- Achievement: `/stats`

## Analytics

Mobile tracks:

- `notification_opened`
- `review_reminder_opened`

Server logs sent, failed, and opened status in `notification_logs`.

Use `notification_logs` to calculate:

- Open rate
- Failure rate
- Reminder engagement
- Retention impact by comparing opened reminders against review activity

## Production Notes

- Run migrations before deploying.
- Deploy `notification-thing` or `developer` to the test stage first.
- Keep `FCM_SERVICE_ACCOUNT_JSON` and AWS secrets out of the repo.
- Monitor `notification_logs.status = 'failed'`.
- Disable any old Supabase notification Edge Functions or Cron jobs in Supabase.
- Invalid FCM token cleanup is not automated in this AWS MVP yet.
