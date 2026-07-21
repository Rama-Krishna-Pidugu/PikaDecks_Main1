import random


TEMPLATES = {
    "streak": {
        "titles": [
            "Keep your streak alive",
            "Your streak needs one review",
            "One quick review protects your streak",
            "Streak check-in",
            "Before the day ends",
        ],
        "bodies": [
            "Complete one review to keep your {streak_days}-day streak alive.",
            "A short session today keeps your progress moving.",
            "Review one card before the day closes.",
            "Your {streak_days}-day streak is waiting for a quick check-in.",
            "Open PikaDecks and finish one review to stay on track.",
        ],
    },
    "overdue_review": {
        "titles": [
            "Reviews are ready",
            "A quick review window is open",
            "Cards are waiting",
            "Strengthen today's memory",
            "Review time",
        ],
        "bodies": [
            "{count} cards are ready for review.",
            "You have {count} cards waiting.",
            "Clear a few due cards while the memory is fresh.",
            "{count} cards are due. A short session is enough.",
            "Review now and make tomorrow's session lighter.",
        ],
    },
    "daily_review": {
        "titles": [
            "Start with one card",
            "Your decks are ready",
            "A small study step",
            "Ready for a quick session?",
            "Open today's learning",
        ],
        "bodies": [
            "Your decks are waiting for you.",
            "Jump back in and continue your progress.",
            "A short review now keeps the habit warm.",
            "Open PikaDecks and make one small step today.",
            "Your next review session is ready when you are.",
        ],
    },
    "engagement_8am": {
        "titles": [
            "Morning review time ☕",
            "Start your day with PikaDecks",
            "Ready for your morning session?",
            "Start with a quick card",
        ],
        "bodies": [
            "Keep the momentum going. Open your first deck now!",
            "Kickstart your learning habit this morning.",
            "Just 2 minutes of recall will set up your day.",
            "Unlock your potential today with active recall.",
        ],
    },
    "engagement_10am": {
        "titles": [
            "Mid-morning brain boost 🧠",
            "A quick cognitive break?",
            "Keep learning active",
            "Perfect time for flashcards",
        ],
        "bodies": [
            "Strengthen your neural connections with a short study session.",
            "Take 2 minutes to review your due cards.",
            "PikaDecks is ready for your next study step.",
            "A fast review session keeps your progress warm.",
        ],
    },
    "engagement_1pm": {
        "titles": [
            "Afternoon study break",
            "Lunchtime recall session 🍕",
            "Quick review window",
            "Keep your day on track",
        ],
        "bodies": [
            "Review a few cards during your lunch break.",
            "Active recall helps you retain knowledge long term.",
            "Keep your study habit strong this afternoon.",
            "Your study decks are waiting. Open PikaDecks!",
        ],
    },
    "engagement_6pm": {
        "titles": [
            "Wrap up your day with a review",
            "Evening study session 🌅",
            "Lock in today's knowledge",
            "Quick study wrap-up",
        ],
        "bodies": [
            "Do a quick recall session before relaxing.",
            "Review your custom card decks now.",
            "A few cards today keeps the forgetfulness away.",
            "Strengthen your memory before the day ends.",
        ],
    },
    "night_reminder_9pm": {
        "titles": [
            "Ready to lock in your streak?",
            "Finish today's study goal",
            "Evening reminder",
            "One quick review tonight?",
        ],
        "bodies": [
            "You haven't opened the app today. Keep your daily habit active!",
            "Review at least one card to lock in your progress today.",
            "A tiny session tonight keeps your learning momentum warm.",
            "Open PikaDecks now to study before your day ends.",
        ],
    },
    "streak_warning_1130pm": {
        "titles": [
            "Save your streak! ⏳",
            "Streak warning!",
            "Final call for today's study",
            "Don't lose your streak!",
        ],
        "bodies": [
            "Your daily streak is expiring in 30 minutes! Open the app now.",
            "Just one review protects your streak from resetting.",
            "Open PikaDecks immediately to keep your streak alive.",
            "Time is running out! Protect your learning streak tonight.",
        ],
    },
    # 9 PM achievement — sent to users who ALREADY reviewed today
    "night_achievement_9pm": {
        "titles": [
            "You crushed it today! 🎉",
            "Today's goal: complete! 🏆",
            "Knowledge locked in ✅",
            "Great study session today!",
        ],
        "bodies": [
            "You reviewed {cards_reviewed} cards today. Your {streak_days}-day streak is safe! 🔥",
            "Amazing! {cards_reviewed} cards reviewed. Keep the momentum tomorrow!",
            "You nailed it — {cards_reviewed} reviews done. Day {streak_days} streak continues! 💪",
            "{cards_reviewed} cards reviewed today. You're building a habit that lasts.",
        ],
    },
    # 11:30 PM sleep reminder — sent ONLY to users who reviewed today
    "sleep_reminder_1130pm": {
        "titles": [
            "Time to rest, champion! 🌙",
            "Great day — now get some sleep 😴",
            "Rest up, you earned it! 🛌",
            "Study done. Sleep time! 💤",
        ],
        "bodies": [
            "You reviewed {cards_reviewed} cards today. Sleep well — your brain will consolidate all of it! 🧠",
            "{cards_reviewed} reviews in the bag! Rest now, come back stronger tomorrow. 🔥",
            "Day {streak_days} streak secured! Get some rest — see you tomorrow. 🌟",
            "You studied hard today ({cards_reviewed} cards). Your streak is safe. Good night! 😴",
        ],
    },
}


def render(notification_type, metadata, excluded_messages=None):
    template = TEMPLATES.get(notification_type)
    if not template:
        return {"title": "Notification", "body": "You have a new notification."}

    excluded_messages = excluded_messages or set()
    combinations = [
        (title, body)
        for title in template["titles"]
        for body in template["bodies"]
    ]
    random.shuffle(combinations)

    selected_title, selected_body = combinations[0]
    for title, body in combinations:
        rendered_title = title.format(**metadata)
        rendered_body = body.format(**metadata)
        if (rendered_title, rendered_body) not in excluded_messages:
            selected_title, selected_body = title, body
            break

    return {
        "title": selected_title.format(**metadata),
        "body": selected_body.format(**metadata),
    }
