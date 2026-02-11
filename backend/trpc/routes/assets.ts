import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { assets as initialAssets } from "@/mocks/data";
import { db } from "@/backend/db";
import type { Asset, AssetType, Platform } from "@/types";

const COLLECTION = "assets";
const MAX_INLINE_DATA_URI_LENGTH = 300_000;

function validateInlineMedia(label: string, value?: string) {
  if (!value) return;
  if (value.startsWith("data:") && value.length > MAX_INLINE_DATA_URI_LENGTH) {
    throw new Error(`${label} is too large. Please use a smaller file.`);
  }
}

async function ensureInitialized(): Promise<void> {
  const dbAssets = await db.getCollection<Asset>(COLLECTION);
  if (dbAssets.length === 0) {
    console.log("[Assets] No assets in DB, initializing with defaults");
    for (const asset of initialAssets) {
      await db.create(COLLECTION, asset);
    }
  }
}

let initPromise: Promise<void> | null = null;

async function getAssets(): Promise<Asset[]> {
  if (!initPromise) {
    initPromise = ensureInitialized();
  }
  await initPromise;
  const assets = await db.getCollection<Asset>(COLLECTION);
  console.log("[Assets] Read from DB, count:", assets.length);
  return assets;
}

export const assetsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const assets = await getAssets();
    console.log("[Assets] Fetching all assets, count:", assets.length);
    return assets;
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Assets] Fetching asset by id:", input.id);
      const assets = await getAssets();
      const asset = assets.find((a) => a.id === input.id);
      if (!asset) {
        throw new Error("Asset not found");
      }
      return asset;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        type: z.enum(["image", "video", "document", "template"]),
        url: z.string(),
        thumbnail: z.string(),
        campaignId: z.string().optional(),
        campaignTitle: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube"])),
        format: z.string(),
        size: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      validateInlineMedia("Asset URL", input.url);
      validateInlineMedia("Asset thumbnail", input.thumbnail);
      const newAsset: Asset = {
        id: `asset-${Date.now()}`,
        name: input.name,
        type: input.type as AssetType,
        url: input.url,
        thumbnail: input.thumbnail,
        campaignId: input.campaignId,
        campaignTitle: input.campaignTitle,
        platforms: input.platforms as Platform[],
        format: input.format,
        size: input.size,
        downloadCount: 0,
        createdAt: new Date().toISOString().split("T")[0],
      };
      
      await db.create(COLLECTION, newAsset);
      
      console.log("[Assets] Created new asset:", newAsset.id);
      return newAsset;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        type: z.enum(["image", "video", "document", "template"]).optional(),
        url: z.string().optional(),
        thumbnail: z.string().optional(),
        campaignId: z.string().optional(),
        campaignTitle: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube"])).optional(),
        format: z.string().optional(),
        size: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateInlineMedia("Asset URL", input.url);
      validateInlineMedia("Asset thumbnail", input.thumbnail);
      const assets = await getAssets();
      const existing = assets.find((a) => a.id === input.id);
      if (!existing) {
        throw new Error("Asset not found");
      }
      
      const updatedAsset = { ...existing, ...input } as Asset;
      await db.update(COLLECTION, input.id, updatedAsset);
      
      console.log("[Assets] Updated asset:", input.id);
      return updatedAsset;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const assets = await getAssets();
      const existing = assets.find((a) => a.id === input.id);
      if (!existing) {
        throw new Error("Asset not found");
      }
      
      await db.remove(COLLECTION, input.id);
      
      console.log("[Assets] Deleted asset:", input.id);
      return { success: true };
    }),

  incrementDownload: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const assets = await getAssets();
      const asset = assets.find((a) => a.id === input.id);
      if (!asset) {
        return null;
      }
      
      const updatedAsset = { ...asset, downloadCount: asset.downloadCount + 1 };
      await db.update(COLLECTION, input.id, updatedAsset);
      
      console.log("[Assets] Incremented download for asset:", input.id);
      return updatedAsset;
    }),
});
