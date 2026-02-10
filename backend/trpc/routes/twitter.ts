import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

const getTwitterToken = () => {
  try {
    return process.env.TWITTER_BEARER_TOKEN || null;
  } catch {
    return null;
  }
};

interface TweetMetrics {
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
}

interface TweetData {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  metrics: TweetMetrics;
}

async function fetchTweetMetrics(tweetId: string): Promise<TweetData | null> {
  const token = getTwitterToken();
  if (!token) {
    console.error("[Twitter] TWITTER_BEARER_TOKEN not configured");
    throw new Error("Twitter API not configured");
  }

  try {
    const response = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics,created_at,author_id`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Twitter] API error:", response.status, errorText);
      throw new Error(`Twitter API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data) {
      console.log("[Twitter] Tweet not found:", tweetId);
      return null;
    }

    const tweet = data.data;
    const metrics = tweet.public_metrics;

    console.log("[Twitter] Fetched metrics for tweet:", tweetId, metrics);

    return {
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      createdAt: tweet.created_at,
      metrics: {
        impressions: metrics.impression_count || 0,
        likes: metrics.like_count || 0,
        retweets: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        quotes: metrics.quote_count || 0,
      },
    };
  } catch (error) {
    console.error("[Twitter] Error fetching tweet metrics:", error);
    throw error;
  }
}

function extractTweetId(url: string): string | null {
  const patterns = [
    /twitter\.com\/\w+\/status\/(\d+)/,
    /x\.com\/\w+\/status\/(\d+)/,
    /^(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export const twitterRouter = createTRPCRouter({
  getTweetMetrics: publicProcedure
    .input(z.object({ tweetUrl: z.string() }))
    .query(async ({ input }) => {
      console.log("[Twitter] Getting metrics for URL:", input.tweetUrl);
      
      const tweetId = extractTweetId(input.tweetUrl);
      if (!tweetId) {
        throw new Error("Invalid tweet URL");
      }

      const tweetData = await fetchTweetMetrics(tweetId);
      return tweetData;
    }),

  getBatchTweetMetrics: publicProcedure
    .input(z.object({ tweetUrls: z.array(z.string()) }))
    .query(async ({ input }) => {
      console.log("[Twitter] Getting batch metrics for", input.tweetUrls.length, "tweets");
      
      const results: { url: string; data: TweetData | null; error?: string }[] = [];

      for (const url of input.tweetUrls) {
        try {
          const tweetId = extractTweetId(url);
          if (!tweetId) {
            results.push({ url, data: null, error: "Invalid tweet URL" });
            continue;
          }

          const tweetData = await fetchTweetMetrics(tweetId);
          results.push({ url, data: tweetData });
        } catch (error) {
          results.push({ 
            url, 
            data: null, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      return results;
    }),

  getUserTimeline: publicProcedure
    .input(z.object({ username: z.string(), maxResults: z.number().optional() }))
    .query(async ({ input }) => {
      const token = getTwitterToken();
      if (!token) {
        throw new Error("Twitter API not configured");
      }

      console.log("[Twitter] Getting timeline for user:", input.username);

      try {
        const userResponse = await fetch(
          `https://api.twitter.com/2/users/by/username/${input.username}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!userResponse.ok) {
          throw new Error(`Failed to fetch user: ${userResponse.status}`);
        }

        const userData = await userResponse.json();
        const userId = userData.data?.id;

        if (!userId) {
          throw new Error("User not found");
        }

        const maxResults = input.maxResults || 10;
        const tweetsResponse = await fetch(
          `https://api.twitter.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=public_metrics,created_at`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!tweetsResponse.ok) {
          throw new Error(`Failed to fetch tweets: ${tweetsResponse.status}`);
        }

        const tweetsData = await tweetsResponse.json();
        const tweets = tweetsData.data || [];

        console.log("[Twitter] Fetched", tweets.length, "tweets for user:", input.username);

        return tweets.map((tweet: Record<string, unknown>) => ({
          id: tweet.id,
          text: tweet.text,
          createdAt: tweet.created_at,
          metrics: {
            impressions: (tweet.public_metrics as Record<string, number>)?.impression_count || 0,
            likes: (tweet.public_metrics as Record<string, number>)?.like_count || 0,
            retweets: (tweet.public_metrics as Record<string, number>)?.retweet_count || 0,
            replies: (tweet.public_metrics as Record<string, number>)?.reply_count || 0,
            quotes: (tweet.public_metrics as Record<string, number>)?.quote_count || 0,
          },
        }));
      } catch (error) {
        console.error("[Twitter] Error fetching user timeline:", error);
        throw error;
      }
    }),

  healthCheck: publicProcedure.query(() => {
    const token = getTwitterToken();
    const configured = !!token;
    console.log("[Twitter] Health check - configured:", configured);
    return {
      configured,
      message: configured 
        ? "Twitter API is configured" 
        : "Twitter API not configured - set TWITTER_BEARER_TOKEN",
    };
  }),
});
