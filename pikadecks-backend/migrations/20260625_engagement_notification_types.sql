-- Add engagement slot notification types used by the Lambda notification scheduler.
-- The Lambda introduced SLOT_8AM, SLOT_10AM, SLOT_1PM, SLOT_6PM, SLOT_9PM, and
-- SLOT_1130PM which map to engagement_* and night/streak_warning types.
-- The existing constraint only allowed 5 types; expand it to include all 11.

alter table public.notification_logs
  drop constraint if exists notification_logs_notification_type_check;

alter table public.notification_logs
  add constraint notification_logs_notification_type_check
  check (
    notification_type in (
      -- Original types
      'daily_review',
      'overdue_review',
      'streak',
      'achievement',
      'flashcard_generation',
      -- Engagement slot types (Lambda scheduler)
      'engagement_8am',
      'engagement_10am',
      'engagement_1pm',
      'engagement_6pm',
      'night_reminder_9pm',
      'streak_warning_1130pm',
      -- New conditional types (9PM achievement, 11:30PM sleep reminder)
      'night_achievement_9pm',
      'sleep_reminder_1130pm'
    )
  );
