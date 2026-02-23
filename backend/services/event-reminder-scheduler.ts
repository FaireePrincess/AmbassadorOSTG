import { db } from "@/backend/db";
import { sendOnlineEventReminder } from "@/backend/services/telegram-notifications";
import type { Event } from "@/types";

const EVENTS_COLLECTION = "events";
const REMINDER_LOG_COLLECTION = "event_reminder_logs";
const SCHEDULE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TARGET_LEAD_MS = 60 * 60 * 1000;
const LATE_GRACE_MS = 5 * 60 * 1000;
const SCHEDULE_LOOKAHEAD_MS = 25 * 60 * 60 * 1000;

type ReminderLog = {
  id: string;
  eventId: string;
  eventDate: string;
  eventTime: string;
  sentAt: string;
};

let scheduleSyncTimer: ReturnType<typeof setInterval> | null = null;
const scheduledReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

function parseTimeParts(raw: string): { hour: number; minute: number; second: number } | null {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return { hour, minute, second };
}

function parseUtcOffsetMinutes(timezone: string): number | null {
  const raw = timezone.trim().toUpperCase();
  if (!raw) return null;
  if (raw === "UTC" || raw === "GMT") return 0;

  const match = raw.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (hours > 14 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
}

function getEventStartMs(event: Event): number | null {
  const dateMatch = event.date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeParts = parseTimeParts(event.time || "00:00");
  if (!dateMatch || !timeParts) {
    const fallback = Date.parse(`${event.date}T${event.time}`);
    return Number.isNaN(fallback) ? null : fallback;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const offsetMinutes = parseUtcOffsetMinutes(event.timezone || "UTC");
  const utcBase = Date.UTC(year, month - 1, day, timeParts.hour, timeParts.minute, timeParts.second);

  if (offsetMinutes === null) {
    const fallback = Date.parse(`${event.date}T${event.time}`);
    return Number.isNaN(fallback) ? utcBase : fallback;
  }

  return utcBase - (offsetMinutes * 60 * 1000);
}

function getReminderLogId(event: Event): string {
  return `event-reminder-${event.id}-${event.date}-${event.time}`;
}

async function sendAndLogReminder(event: Event): Promise<void> {
  const logId = getReminderLogId(event);
  const existing = await db.getById<ReminderLog>(REMINDER_LOG_COLLECTION, logId);
  if (existing) return;

  const result = await sendOnlineEventReminder(event);
  if (!result.sent) {
    console.log("[Events] Telegram reminder failed:", event.id, result.reason);
    return;
  }

  await db.create<ReminderLog>(REMINDER_LOG_COLLECTION, {
    id: logId,
    eventId: event.id,
    eventDate: event.date,
    eventTime: event.time,
    sentAt: new Date().toISOString(),
  });

  console.log("[Events] Telegram reminder sent:", event.id);
}

function clearScheduledReminder(key: string) {
  const timer = scheduledReminderTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  scheduledReminderTimers.delete(key);
}

async function scheduleEventReminder(event: Event, nowMs: number): Promise<void> {
  if (event.type !== "online") return;
  if (!event.link || !event.link.trim()) return;

  const startMs = getEventStartMs(event);
  if (!startMs) return;

  const sendAtMs = startMs - TARGET_LEAD_MS;
  const key = getReminderLogId(event);
  const existing = await db.getById<ReminderLog>(REMINDER_LOG_COLLECTION, key);
  if (existing) {
    clearScheduledReminder(key);
    return;
  }

  const delayMs = sendAtMs - nowMs;
  const tooLate = nowMs - sendAtMs > LATE_GRACE_MS;
  const tooFar = delayMs > SCHEDULE_LOOKAHEAD_MS;

  if (tooLate || tooFar) {
    clearScheduledReminder(key);
    return;
  }

  if (delayMs <= 0) {
    clearScheduledReminder(key);
    await sendAndLogReminder(event);
    return;
  }

  if (scheduledReminderTimers.has(key)) return;

  const timer = setTimeout(() => {
    scheduledReminderTimers.delete(key);
    void sendAndLogReminder(event);
  }, delayMs);

  scheduledReminderTimers.set(key, timer);
}

async function syncEventReminderSchedule(): Promise<void> {
  try {
    const events = await db.getCollection<Event>(EVENTS_COLLECTION);
    const nowMs = Date.now();

    const validKeys = new Set<string>();
    for (const event of events) {
      const key = getReminderLogId(event);
      validKeys.add(key);
      await scheduleEventReminder(event, nowMs);
    }

    for (const key of [...scheduledReminderTimers.keys()]) {
      if (!validKeys.has(key)) {
        clearScheduledReminder(key);
      }
    }
  } catch (error) {
    console.log("[Events] Reminder scheduler error:", error instanceof Error ? error.message : String(error));
  }
}

export function startEventReminderScheduler() {
  if (scheduleSyncTimer) return;

  void syncEventReminderSchedule();
  scheduleSyncTimer = setInterval(() => {
    void syncEventReminderSchedule();
  }, SCHEDULE_SYNC_INTERVAL_MS);
}

export function refreshEventReminderSchedule() {
  void syncEventReminderSchedule();
}
