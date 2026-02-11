import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { events as initialEvents } from "@/mocks/data";
import { db } from "@/backend/db";
import type { Event, EventType } from "@/types";

const COLLECTION = "events";
const MAX_DATA_URI_LENGTH = 450_000;

function validateEventThumbnail(thumbnail: string) {
  if (!thumbnail.startsWith("data:image/")) return;
  if (thumbnail.length > MAX_DATA_URI_LENGTH) {
    throw new Error("Event image is too large. Please use a smaller image.");
  }
}

async function ensureInitialized(): Promise<void> {
  const dbEvents = await db.getCollection<Event>(COLLECTION);
  if (dbEvents.length === 0) {
    console.log("[Events] No events in DB, initializing with defaults");
    for (const event of initialEvents) {
      await db.create(COLLECTION, event);
    }
  }
}

let initPromise: Promise<void> | null = null;

async function getEvents(): Promise<Event[]> {
  if (!initPromise) {
    initPromise = ensureInitialized();
  }
  await initPromise;
  const events = await db.getCollection<Event>(COLLECTION);
  console.log("[Events] Read from DB, count:", events.length);
  return events;
}

export const eventsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const events = await getEvents();
    console.log("[Events] Fetching all events, count:", events.length);
    return events;
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Events] Fetching event by id:", input.id);
      const events = await getEvents();
      const event = events.find((e) => e.id === input.id);
      if (!event) {
        throw new Error("Event not found");
      }
      return event;
    }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
        type: z.enum(["irl", "online"]),
        thumbnail: z.string(),
        date: z.string(),
        time: z.string(),
        location: z.string(),
        timezone: z.string(),
        maxAttendees: z.number().optional(),
        link: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateEventThumbnail(input.thumbnail);
      const newEvent: Event = {
        id: `event-${Date.now()}`,
        title: input.title,
        description: input.description,
        type: input.type as EventType,
        thumbnail: input.thumbnail,
        date: input.date,
        time: input.time,
        location: input.location,
        timezone: input.timezone,
        attendees: 0,
        maxAttendees: input.maxAttendees,
        isRsvped: false,
        link: input.link,
      };
      
      await db.create(COLLECTION, newEvent);
      
      console.log("[Events] Created new event:", newEvent.id);
      return newEvent;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(["irl", "online"]).optional(),
        thumbnail: z.string().optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        location: z.string().optional(),
        timezone: z.string().optional(),
        maxAttendees: z.number().optional(),
        link: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const events = await getEvents();
      const existing = events.find((e) => e.id === input.id);
      if (!existing) {
        throw new Error("Event not found");
      }

      if (input.thumbnail) {
        validateEventThumbnail(input.thumbnail);
      }
      
      const updatedEvent = { ...existing, ...input } as Event;
      await db.update(COLLECTION, input.id, updatedEvent);
      
      console.log("[Events] Updated event:", input.id);
      return updatedEvent;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const events = await getEvents();
      const existing = events.find((e) => e.id === input.id);
      if (!existing) {
        throw new Error("Event not found");
      }
      
      await db.remove(COLLECTION, input.id);
      
      console.log("[Events] Deleted event:", input.id);
      return { success: true };
    }),

  rsvp: publicProcedure
    .input(z.object({ id: z.string(), userId: z.string() }))
    .mutation(async ({ input }) => {
      const events = await getEvents();
      const event = events.find((e) => e.id === input.id);
      if (!event) {
        throw new Error("Event not found");
      }
      
      const updatedEvent = {
        ...event,
        attendees: event.attendees + 1,
        isRsvped: true,
      };
      
      await db.update(COLLECTION, input.id, updatedEvent);
      
      console.log("[Events] RSVP for event:", input.id, "by user:", input.userId);
      return updatedEvent;
    }),

  updateRsvp: publicProcedure
    .input(z.object({ id: z.string(), isRsvped: z.boolean() }))
    .mutation(async ({ input }) => {
      const events = await getEvents();
      const event = events.find((e) => e.id === input.id);
      if (!event) {
        throw new Error("Event not found");
      }
      
      const updatedEvent = {
        ...event,
        attendees: Math.max(0, event.attendees + (input.isRsvped ? 1 : -1)),
        isRsvped: input.isRsvped,
      };
      
      await db.update(COLLECTION, input.id, updatedEvent);
      
      console.log("[Events] Updated RSVP for event:", input.id, "isRsvped:", input.isRsvped);
      return updatedEvent;
    }),
});
