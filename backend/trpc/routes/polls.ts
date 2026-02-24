import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { db } from "@/backend/db";
import type { Poll, PollOption, PollVote, User } from "@/types";

const POLLS_COLLECTION = "polls";
const POLL_OPTIONS_COLLECTION = "poll_options";
const POLL_VOTES_COLLECTION = "poll_votes";
const USERS_COLLECTION = "users";

async function getUser(userId: string): Promise<User> {
  const user = await db.getById<User>(USERS_COLLECTION, userId);
  if (!user) throw new Error("User not found");
  return user;
}

async function ensureAdmin(userId: string): Promise<User> {
  const user = await getUser(userId);
  if (user.role !== "admin" || user.status !== "active") {
    throw new Error("Admin access required");
  }
  return user;
}

export const pollsRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ region: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const polls = await db.getCollection<Poll>(POLLS_COLLECTION);
      const now = Date.now();
      return polls
        .filter((poll) => {
          if (input?.region && poll.region && poll.region !== input.region) return false;
          return Date.parse(poll.expiresAt) > now;
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }),

  create: publicProcedure
    .input(
      z.object({
        adminUserId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        region: z.string().nullable().optional(),
        expiresAt: z.string(),
        options: z.array(z.string().min(1)).min(2).max(10),
      })
    )
    .mutation(async ({ input }) => {
      await ensureAdmin(input.adminUserId);
      const now = new Date().toISOString();

      const poll: Poll = {
        id: `poll-${Date.now()}`,
        title: input.title.trim(),
        description: input.description?.trim(),
        createdBy: input.adminUserId,
        region: input.region || null,
        expiresAt: input.expiresAt,
        createdAt: now,
      };

      await db.create<Poll>(POLLS_COLLECTION, poll);

      const options: PollOption[] = input.options.map((label, idx) => ({
        id: `poll-opt-${Date.now()}-${idx}`,
        pollId: poll.id,
        label: label.trim(),
      }));

      await Promise.all(options.map((option) => db.create<PollOption>(POLL_OPTIONS_COLLECTION, option)));
      return { poll, options };
    }),

  vote: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        pollId: z.string(),
        optionId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await getUser(input.userId);
      const poll = await db.getById<Poll>(POLLS_COLLECTION, input.pollId);
      if (!poll) throw new Error("Poll not found");
      if (Date.now() >= Date.parse(poll.expiresAt)) {
        throw new Error("Poll has expired");
      }

      const option = await db.getById<PollOption>(POLL_OPTIONS_COLLECTION, input.optionId);
      if (!option || option.pollId !== input.pollId) {
        throw new Error("Poll option not found");
      }

      const votes = await db.getCollection<PollVote>(POLL_VOTES_COLLECTION);
      const existing = votes.find((vote) => vote.pollId === input.pollId && vote.userId === input.userId);
      if (existing) {
        throw new Error("You already voted on this poll");
      }

      const vote: PollVote = {
        id: `poll-vote-${Date.now()}`,
        pollId: input.pollId,
        optionId: input.optionId,
        userId: input.userId,
        createdAt: new Date().toISOString(),
      };

      await db.create<PollVote>(POLL_VOTES_COLLECTION, vote);
      return { success: true };
    }),

  results: publicProcedure
    .input(z.object({ pollId: z.string() }))
    .query(async ({ input }) => {
      const [poll, options, votes] = await Promise.all([
        db.getById<Poll>(POLLS_COLLECTION, input.pollId),
        db.getCollection<PollOption>(POLL_OPTIONS_COLLECTION),
        db.getCollection<PollVote>(POLL_VOTES_COLLECTION),
      ]);

      if (!poll) throw new Error("Poll not found");

      const pollOptions = options.filter((option) => option.pollId === input.pollId);
      const pollVotes = votes.filter((vote) => vote.pollId === input.pollId);
      const counts = new Map<string, number>();

      for (const vote of pollVotes) {
        counts.set(vote.optionId, (counts.get(vote.optionId) || 0) + 1);
      }

      return {
        poll,
        totalVotes: pollVotes.length,
        options: pollOptions.map((option) => ({
          ...option,
          votes: counts.get(option.id) || 0,
        })),
      };
    }),

  latestCompleted: publicProcedure
    .input(z.object({ region: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const [polls, options, votes] = await Promise.all([
        db.getCollection<Poll>(POLLS_COLLECTION),
        db.getCollection<PollOption>(POLL_OPTIONS_COLLECTION),
        db.getCollection<PollVote>(POLL_VOTES_COLLECTION),
      ]);

      const now = Date.now();
      const completed = polls
        .filter((poll) => {
          if (input?.region && poll.region && poll.region !== input.region) return false;
          return Date.parse(poll.expiresAt) <= now;
        })
        .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));

      const latest = completed[0];
      if (!latest) return null;

      const latestOptions = options.filter((option) => option.pollId === latest.id);
      const latestVotes = votes.filter((vote) => vote.pollId === latest.id);
      const counts = new Map<string, number>();

      for (const vote of latestVotes) {
        counts.set(vote.optionId, (counts.get(vote.optionId) || 0) + 1);
      }

      const optionsWithVotes = latestOptions.map((option) => ({
        ...option,
        votes: counts.get(option.id) || 0,
      }));

      const winner = optionsWithVotes
        .slice()
        .sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label))[0];

      return {
        poll: latest,
        totalVotes: latestVotes.length,
        winner: winner
          ? {
              optionId: winner.id,
              label: winner.label,
              votes: winner.votes,
            }
          : null,
      };
    }),
});
