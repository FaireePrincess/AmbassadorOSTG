import { db } from "@/backend/db";
import { sendOnlineEventReminder } from "@/backend/services/telegram-notifications";
import type { Event } from "@/types";

const EVENTS_COLLECTION = "events";
const REMINDER_LOG_COLLECTION = "event_reminder_logs";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_MINUTES = 60;
const WINDOW_MINUTES = 5;

type ReminderLog = {
  id: string;
  eventId: string;
  eventDate: string;
  eventTime: string;
  sentAt: string;
};

let reminderTimer: ReturnType<typeof setInterval> | null = null;

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

function shouldSendReminder(event: Event, nowMs: number): boolean {
  if (event.type !== "online") return false;
  if (!event.link || !event.link.trim()) return false;

  const startMs = getEventStartMs(event);
  if (!startMs) return false;

  const diffMinutes = (startMs - nowMs) / (60 * 1000);
  return diffMinutes >= TARGET_MINUTES - WINDOW_MINUTES && diffMinutes <= TARGET_MINUTES + WINDOW_MINUTES;
}

function getReminderLogId(event: Event): string {
  return `event-reminder-${event.id}-${event.date}-${event.time}`;
}

async function runEventReminderCheck(): Promise<void> {
  try {
    const events = await db.getCollection<Event>(EVENTS_COLLECTION);
    const nowMs = Date.now();

    for (const event of events) {
      if (!shouldSendReminder(event, nowMs)) continue;

      const logId = getReminderLogId(event);
      const existing = await db.getById<ReminderLog>(REMINDER_LOG_COLLECTION, logId);
      if (existing) continue;

      const result = await sendOnlineEventReminder(event);
      if (!result.sent) {
        console.log("[Events] Telegram reminder failed:", event.id, result.reason);
        continue;
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
  } catch (error) {
    console.log("[Events] Reminder scheduler error:", error instanceof Error ? error.message : String(error));
  }
}

export function startEventReminderScheduler() {
  if (reminderTimer) return;

  void runEventReminderCheck();
  reminderTimer = setInterval(() => {
    void runEventReminderCheck();
  }, CHECK_INTERVAL_MS);
}
