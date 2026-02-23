import type { Event, Task } from "@/types";

type TelegramSendResponse = {
  ok: boolean;
  description?: string;
};

function getTelegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function getTelegramTaskChannelId(): string | null {
  return process.env.TELEGRAM_TASK_CHANNEL_ID || null;
}

function buildTaskMessage(task: Task): string {
  const brief = (task.brief || "").trim();
  const deadline = (task.deadline || "").trim();

  // Telegram max text size is 4096 chars.
  const safeBrief = brief.length > 3000 ? `${brief.slice(0, 2997)}...` : brief;

  return [
    task.title,
    safeBrief,
    `Deadline: ${deadline}`,
  ].join("\n");
}

function buildEventReminderMessage(event: Event): string {
  return [
    "Reminder: Meeting starts in 1 hour",
    event.title,
    `Date: ${event.date}`,
    `Time: ${event.time} ${event.timezone}`,
    `Link: ${event.link || "N/A"}`,
  ].join("\n");
}

async function sendTelegramText(chatId: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  const token = getTelegramBotToken();
  if (!token) {
    return { sent: false, reason: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { sent: false, reason: `Telegram HTTP ${response.status}: ${errorBody.slice(0, 200)}` };
    }

    const payload = (await response.json()) as TelegramSendResponse;
    if (!payload.ok) {
      return { sent: false, reason: payload.description || "Telegram API returned ok=false" };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { sent: false, reason: message };
  }
}

async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string): Promise<{ sent: boolean; reason?: string }> {
  const token = getTelegramBotToken();
  if (!token) {
    return { sent: false, reason: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { sent: false, reason: `Telegram HTTP ${response.status}: ${errorBody.slice(0, 200)}` };
    }

    const payload = (await response.json()) as TelegramSendResponse;
    if (!payload.ok) {
      return { sent: false, reason: payload.description || "Telegram API returned ok=false" };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { sent: false, reason: message };
  }
}

export async function sendTaskActiveNotification(task: Task): Promise<{ sent: boolean; reason?: string }> {
  const token = getTelegramBotToken();
  const chatId = getTelegramTaskChannelId();

  if (!token || !chatId) {
    return { sent: false, reason: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_TASK_CHANNEL_ID" };
  }

  const text = buildTaskMessage(task);
  const photoUrl = (task.thumbnail || "").trim();
  const canSendPhoto = /^https?:\/\//i.test(photoUrl);

  if (canSendPhoto) {
    const photoResult = await sendTelegramPhoto(chatId, photoUrl, text);
    if (photoResult.sent) return photoResult;
    return sendTelegramText(chatId, text);
  }

  return sendTelegramText(chatId, text);
}

export async function sendOnlineEventReminder(event: Event): Promise<{ sent: boolean; reason?: string }> {
  const token = getTelegramBotToken();
  const chatId = getTelegramTaskChannelId();

  if (!token || !chatId) {
    return { sent: false, reason: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_TASK_CHANNEL_ID" };
  }

  return sendTelegramText(chatId, buildEventReminderMessage(event));
}
