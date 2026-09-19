# DATA-MODEL — AI LifeOS (Firestore / NoSQL)

Firestore is **not** relational. There are no joins and no foreign keys. We model for the
reads we need, denormalize deliberately, and keep counters instead of counting on read.

---

## Modeling rules

1. **Everything under the user.** The root collection `users/{uid}` holds the profile; almost
   everything else is a **subcollection** under the user, so Security Rules stay simple
   (`users/{uid}/...` is readable/writable only by that user).
2. **Denormalize small, hot fields.** e.g. store `habitName` on a habit log so rendering a
   list doesn't require fetching the habit doc.
3. **Keep aggregate counters.** Store streaks and completion counts as fields you update on
   write, rather than counting documents on read.
4. **Store both a Timestamp and a localDate.** Instants are Firestore `Timestamp`. Every
   day-bound document also carries a `localDate` string (`YYYY-MM-DD` in the user's timezone)
   so "today" queries are correct (see ARCHITECTURE §Timezones).
5. **Create composite indexes** for common queries (e.g. tasks by `localDate` + `status`).

> This is a deliberate shift away from ~30 relational tables. Things like TaskTags,
> HabitStreaks, and AppUsageLogs become **embedded fields or subcollections**, not join
> tables. That is the correct Firestore pattern.

---

## Collections

```
users/{uid}
  profile: { name, photoURL, occupation, timezone, createdAt }
  settings: { theme, notifications, quietHours, aiEnabled, aiFrequency,
              dataPermissions, scoreWeights }

  goals/{goalId}

  tasks/{taskId}                # title, description, priority, status, dueDate, startTime,
                                # estMinutes, actualMinutes, category, tags[], localDate,
                                # reminders
    subtasks/{subtaskId}

  dailyPlans/{localDate}        # one doc per day; holds ordered timeBlocks[]
                                # timeBlock: { id, title, start, end, linkedTaskId?, type,
                                #              planned:true, status?, actualMinutes? }

  calendarEvents/{eventId}

  habits/{habitId}              # name, schedule, target, streakCurrent, streakBest, color
    logs/{logId}                # habitId, habitName, localDate, status, value

  sleepLogs/{localDate}         # sleepTime, wakeTime, durationMin, quality, goalMin
  workoutLogs/{workoutId}       # type, durationMin, localDate, completed, notes
  moodLogs/{localDate}          # mood, note
  journalEntries/{entryId}      # localDate, type(morning/evening), text (ENCRYPTED)
  screenTimeLogs/{localDate}    # phoneMin, laptopMin, focusMin, idleMin, byCategory{}
  timelineEvents/{eventId}      # ts, localDate, icon, type, title, source, meta

  aiInteractions/{interactionId}# prompt summary, model, tokens, timestamp
  aiRecommendations/{recId}     # text, type, status(new/accepted/dismissed), createdAt

  analyticsSnapshots/{localDate}# computed nightly: scores, completion %, trends
  notifications/{notifId}       # type, body, status, scheduledFor, sentAt
  devices/{deviceId}            # fcmToken, platform, lastSeen
  achievements/{achievementId}
```

### What v1 actually uses

Only these are read/written in v1 (the core loop):

- `users/{uid}/profile` and `users/{uid}/settings`
- `tasks/{taskId}` (+ `subtasks`)
- `dailyPlans/{localDate}` (with `timeBlocks[]` carrying planned + captured actual)
- `analyticsSnapshots/{localDate}` *(optional in v1 — the daily productivity score can be
  computed on the fly by the `/dashboard` endpoint; snapshots become important in Phase 4)*

Everything else is created in its phase (see SCOPE.md).

---

## Key documents in detail

### `dailyPlans/{localDate}` — the heart of the loop

One document per local day. Holds an ordered array of time blocks. Each block carries both
the **plan** and the **captured actual**:

```jsonc
{
  "localDate": "2026-09-18",
  "timeBlocks": [
    {
      "id": "blk_1",
      "title": "DSA practice",
      "start": "08:00",
      "end": "09:30",
      "type": "focus",
      "linkedTaskId": "task_abc",
      "planned": true,
      "status": "done",          // "done" | "missed" | null (not yet captured)
      "actualMinutes": 75        // optional quick adjust; defaults to planned duration
    }
  ]
}
```

The one-tap ✅/❌ writes `status`; the optional adjust writes `actualMinutes`. Planned vs
Actual is derived from this document plus tasks.

### `tasks/{taskId}`

States: `Pending`, `In Progress`, `Completed`, `Missed`, `Cancelled`, `Archived`. `localDate`
buckets it to a day; `estMinutes` vs `actualMinutes` feeds Planned vs Actual and the
"you underestimate X" insight later.

### `journalEntries/{entryId}` — sensitive

`text` is **encrypted before storage** (see PRIVACY.md). Not in v1.

---

## Security & integrity intentions

These become the actual Firestore Security Rules (`firestore.rules`, added in Phase 1):

1. **Ownership.** A user can only ever access `users/{their-uid}/**`. All other access is
   denied by default.
2. **Shape validation.** Validate document shapes with rules where cheap (types, required
   fields, enum values for `status`), and with Express + Zod/Joi for anything trusted.
3. **Encryption.** Journal text (and any equally sensitive field) must be encrypted before it
   is written. Rules cannot enforce encryption, so this is enforced in code — see PRIVACY.md.
4. **No cross-user references.** Denormalized fields (e.g. `habitName` on a log) are copies,
   never pointers to another user's data.

### Rule sketch (intent, not final)

```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

Trusted server writes go through the **Admin SDK**, which bypasses rules — so Express is where
cross-record and validation-heavy writes live.

---

## Indexes to plan for

- `tasks` by `localDate` (asc) + `status` — "today's tasks by state" on the dashboard.
- `tasks` by `dueDate` — upcoming/overdue.
- `timelineEvents` by `localDate` + `ts` — the Life Timeline (Phase 6).
- `aiRecommendations` by `status` + `createdAt` — surfacing new suggestions (Phase 5).

Add composite indexes as the queries land; Firestore will tell you which are missing.
