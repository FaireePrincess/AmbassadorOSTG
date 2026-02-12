import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { assets as initialAssets } from "@/mocks/data";
import { db } from "@/backend/db";
import { DEFAULT_ASSET_FOLDER, DEFAULT_ASSET_FOLDER_ID } from "@/constants/assetFolders";
import type { Asset, AssetFolder, AssetType, Platform } from "@/types";

const COLLECTION = "assets";
const FOLDER_COLLECTION = "asset_folders";
const MAX_INLINE_DATA_URI_LENGTH = 300_000;
const ENABLE_DEFAULT_SEEDING = (process.env.ENABLE_DEFAULT_SEEDING || "false") === "true";

function validateInlineMedia(label: string, value?: string) {
  if (!value) return;
  if (value.startsWith("data:") && value.length > MAX_INLINE_DATA_URI_LENGTH) {
    throw new Error(`${label} is too large. Please use a smaller file.`);
  }
}

async function ensureInitialized(): Promise<void> {
  const dbAssets = await db.getCollection<Asset>(COLLECTION);
  if (dbAssets.length === 0 && ENABLE_DEFAULT_SEEDING) {
    console.log("[Assets] No assets in DB, initializing with defaults");
    for (const asset of initialAssets) {
      await db.create(COLLECTION, asset);
    }
  } else if (dbAssets.length === 0) {
    console.log("[Assets] Collection empty, seeding disabled");
  }
}

let initPromise: Promise<void> | null = null;
let foldersInitPromise: Promise<void> | null = null;

async function ensureFoldersInitialized(): Promise<void> {
  const dbFolders = await db.getCollection<AssetFolder>(FOLDER_COLLECTION);
  if (dbFolders.length === 0) {
    await db.create(FOLDER_COLLECTION, DEFAULT_ASSET_FOLDER);
  }
}

async function getAssets(): Promise<Asset[]> {
  if (!initPromise) {
    initPromise = ensureInitialized();
  }
  await initPromise;
  const assets = await db.getCollection<Asset>(COLLECTION);
  console.log("[Assets] Read from DB, count:", assets.length);
  return assets.map((asset) => ({
    ...asset,
    folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID,
  }));
}

async function getFolders(): Promise<AssetFolder[]> {
  if (!foldersInitPromise) {
    foldersInitPromise = ensureFoldersInitialized();
  }
  await foldersInitPromise;
  const folders = await db.getCollection<AssetFolder>(FOLDER_COLLECTION);
  if (!folders.some((folder) => folder.id === DEFAULT_ASSET_FOLDER_ID)) {
    await db.create(FOLDER_COLLECTION, DEFAULT_ASSET_FOLDER);
    return [DEFAULT_ASSET_FOLDER, ...folders];
  }
  return folders;
}

async function resolveFolderId(folderId?: string): Promise<string> {
  const folders = await getFolders();
  const candidate = folderId || DEFAULT_ASSET_FOLDER_ID;
  if (folders.some((folder) => folder.id === candidate)) {
    return candidate;
  }
  return DEFAULT_ASSET_FOLDER_ID;
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
        folderId: z.string().optional(),
        url: z.string(),
        thumbnail: z.string(),
        campaignId: z.string().optional(),
        campaignTitle: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube", "facebook"])),
        format: z.string(),
        size: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      validateInlineMedia("Asset URL", input.url);
      validateInlineMedia("Asset thumbnail", input.thumbnail);
      const folderId = await resolveFolderId(input.folderId);
      const newAsset: Asset = {
        id: `asset-${Date.now()}`,
        name: input.name,
        type: input.type as AssetType,
        folderId,
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
        folderId: z.string().optional(),
        url: z.string().optional(),
        thumbnail: z.string().optional(),
        campaignId: z.string().optional(),
        campaignTitle: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube", "facebook"])).optional(),
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
      if (input.folderId !== undefined) {
        updatedAsset.folderId = await resolveFolderId(input.folderId);
      }
      await db.update(COLLECTION, input.id, updatedAsset);
      
      console.log("[Assets] Updated asset:", input.id);
      return updatedAsset;
    }),

  listFolders: publicProcedure.query(async () => {
    const folders = await getFolders();
    return folders;
  }),

  createFolder: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const folder: AssetFolder = {
        id: `folder-${Date.now()}`,
        name: input.name.trim(),
        color: input.color || "#6366F1",
        createdAt: new Date().toISOString(),
      };
      await db.create(FOLDER_COLLECTION, folder);
      return folder;
    }),

  updateFolder: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const folders = await getFolders();
      const existing = folders.find((folder) => folder.id === input.id);
      if (!existing) {
        throw new Error("Folder not found");
      }
      const updatedFolder: AssetFolder = {
        ...existing,
        ...input,
        name: input.name?.trim() || existing.name,
        updatedAt: new Date().toISOString(),
      };
      await db.update(FOLDER_COLLECTION, input.id, updatedFolder);
      return updatedFolder;
    }),

  deleteFolder: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      if (input.id === DEFAULT_ASSET_FOLDER_ID) {
        throw new Error("Default folder cannot be deleted");
      }

      const folders = await getFolders();
      const existing = folders.find((folder) => folder.id === input.id);
      if (!existing) {
        throw new Error("Folder not found");
      }

      const assets = await getAssets();
      const updates = assets
        .filter((asset) => asset.folderId === input.id)
        .map((asset) =>
          db.update(COLLECTION, asset.id, {
            ...asset,
            folderId: DEFAULT_ASSET_FOLDER_ID,
          })
        );

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      await db.remove(FOLDER_COLLECTION, input.id);
      return { success: true };
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
