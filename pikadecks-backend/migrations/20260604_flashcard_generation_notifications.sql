-- Allow upload pipeline completion/failure notifications.

alter table public.notification_logs
  drop constraint if exists notification_logs_notification_type_check;

alter table public.notification_logs
  add constraint notification_logs_notification_type_check
  check (
    notification_type in (
      'daily_review',
      'overdue_review',
      'streak',
      'achievement',
      'flashcard_generation'
    )
  );
