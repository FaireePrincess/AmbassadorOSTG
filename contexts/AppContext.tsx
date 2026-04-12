import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { Submission, SubmissionRating, Task, Asset, Event, AmbassadorPost, AssetFolder, ExtraContentSubmission } from '@/types';
import { 
  ambassadorPosts as mockAmbassadorPosts,
  tasks as mockTasks,
  assets as mockAssets,
  events as mockEvents,
  submissions as mockSubmissions,
} from '@/mocks/data';
import { trpcClient, isBackendEnabled } from '@/lib/trpc';
import { DEFAULT_ASSET_FOLDER, DEFAULT_ASSET_FOLDER_ID, ensureDefaultFolder } from '@/constants/assetFolders';

const STORAGE_KEYS = {
  RSVPS: 'ambassador_rsvps',
  AMBASSADOR_FEED: 'ambassador_feed',
  TASKS: 'ambassador_tasks',
  ASSETS: 'ambassador_assets',
  ASSET_FOLDERS: 'ambassador_asset_folders',
  EVENTS: 'ambassador_events',
  SUBMISSIONS: 'ambassador_submissions',
  EXTRA_CONTENT: 'ambassador_extra_content',
};

const BACKEND_ENABLED = isBackendEnabled();
const BACKEND_CACHE_FALLBACKS = {
  TASKS: [] as Task[],
  EVENTS: [] as Event[],
  ASSETS: [] as Asset[],
  ASSET_FOLDERS: [DEFAULT_ASSET_FOLDER] as AssetFolder[],
  SUBMISSIONS: [] as Submission[],
  FEED: [] as AmbassadorPost[],
  EXTRA_CONTENT: [] as ExtraContentSubmission[],
};

async function loadStoredList<T>(key: string, fallback: T[]): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      await AsyncStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch (error) {
    console.log('[AppContext] Error loading local list:', key, error);
  }
  return fallback;
}

async function saveStoredList<T>(key: string, list: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch (error) {
    console.log('[AppContext] Error saving local list:', key, error);
  }
}

export const [AppProvider, useApp] = createContextHook(() => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetFolders, setAssetFolders] = useState<AssetFolder[]>([DEFAULT_ASSET_FOLDER]);
  const [events, setEvents] = useState<Event[]>([]);
  const [rsvpStates, setRsvpStates] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ambassadorFeed, setAmbassadorFeed] = useState<AmbassadorPost[]>([]);
  const [extraContent, setExtraContent] = useState<ExtraContentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const syncSubmissionViewsFromBackend = useCallback(async () => {
    if (!BACKEND_ENABLED) return;
    const [backendSubmissions, backendTasks, backendFeed, backendExtraContent] = await Promise.all([
      trpcClient.submissions.list.query().catch(() => null),
      trpcClient.tasks.list.query().catch(() => null),
      trpcClient.submissions.getAmbassadorFeed.query({ limit: 50 }).catch(() => null),
      trpcClient.extraContent.list.query().catch(() => null),
    ]);

    if (Array.isArray(backendSubmissions)) {
      setSubmissions(backendSubmissions);
      void saveStoredList(STORAGE_KEYS.SUBMISSIONS, backendSubmissions);
    }
    if (Array.isArray(backendTasks)) {
      setTasks(backendTasks);
      void saveStoredList(STORAGE_KEYS.TASKS, backendTasks);
    }
    if (Array.isArray(backendFeed)) {
      setAmbassadorFeed(backendFeed);
      void saveStoredList(STORAGE_KEYS.AMBASSADOR_FEED, backendFeed);
    }
    if (Array.isArray(backendExtraContent)) {
      setExtraContent(backendExtraContent);
      void saveStoredList(STORAGE_KEYS.EXTRA_CONTENT, backendExtraContent);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    console.log('[AppContext] Loading all data from backend...');
    try {
      if (BACKEND_ENABLED) {
        const [
          cachedTasks,
          cachedEvents,
          cachedAssets,
          cachedAssetFolders,
          cachedSubmissions,
          cachedFeed,
          cachedExtraContent,
        ] = await Promise.all([
          loadStoredList(STORAGE_KEYS.TASKS, BACKEND_CACHE_FALLBACKS.TASKS),
          loadStoredList(STORAGE_KEYS.EVENTS, BACKEND_CACHE_FALLBACKS.EVENTS),
          loadStoredList(STORAGE_KEYS.ASSETS, BACKEND_CACHE_FALLBACKS.ASSETS),
          loadStoredList(STORAGE_KEYS.ASSET_FOLDERS, BACKEND_CACHE_FALLBACKS.ASSET_FOLDERS),
          loadStoredList(STORAGE_KEYS.SUBMISSIONS, BACKEND_CACHE_FALLBACKS.SUBMISSIONS),
          loadStoredList(STORAGE_KEYS.AMBASSADOR_FEED, BACKEND_CACHE_FALLBACKS.FEED),
          loadStoredList(STORAGE_KEYS.EXTRA_CONTENT, BACKEND_CACHE_FALLBACKS.EXTRA_CONTENT),
        ]);

        // Render can cold-start/fail transiently; hydrate from last-known-good cache first.
        if (cachedTasks.length > 0) setTasks(cachedTasks);
        if (cachedEvents.length > 0) setEvents(cachedEvents);
        if (cachedAssets.length > 0) setAssets(cachedAssets.map(asset => ({ ...asset, folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID })));
        if (cachedAssetFolders.length > 0) setAssetFolders(ensureDefaultFolder(cachedAssetFolders));
        if (cachedSubmissions.length > 0) setSubmissions(cachedSubmissions);
        if (cachedFeed.length > 0) setAmbassadorFeed(cachedFeed);
        if (cachedExtraContent.length > 0) setExtraContent(cachedExtraContent);

        const [
          backendTasks,
          backendEvents,
          backendAssets,
          backendAssetFolders,
          backendSubmissions,
          backendFeed,
          backendExtraContent,
          storedRsvps,
        ] = await Promise.all([
          trpcClient.tasks.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch tasks from backend:', e);
            return null;
          }),
          trpcClient.events.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch events from backend:', e);
            return null;
          }),
          trpcClient.assets.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch assets from backend:', e);
            return null;
          }),
          trpcClient.assets.listFolders.query().catch((e) => {
            console.log('[AppContext] Failed to fetch asset folders from backend:', e);
            return null;
          }),
          trpcClient.submissions.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch submissions from backend:', e);
            return null;
          }),
          trpcClient.submissions.getAmbassadorFeed.query({ limit: 50 }).catch((e) => {
            console.log('[AppContext] Failed to fetch ambassador feed from backend:', e);
            return null;
          }),
          trpcClient.extraContent.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch extra content from backend:', e);
            return null;
          }),
          AsyncStorage.getItem(STORAGE_KEYS.RSVPS).catch(() => null),
        ]);

        if (Array.isArray(backendTasks)) {
          setTasks(backendTasks);
          void saveStoredList(STORAGE_KEYS.TASKS, backendTasks);
        }
        if (Array.isArray(backendEvents)) {
          setEvents(backendEvents);
          void saveStoredList(STORAGE_KEYS.EVENTS, backendEvents);
        }
        if (Array.isArray(backendAssets)) {
          const normalizedAssets = backendAssets.map(asset => ({ ...asset, folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID }));
          setAssets(normalizedAssets);
          void saveStoredList(STORAGE_KEYS.ASSETS, normalizedAssets);
        }
        if (Array.isArray(backendAssetFolders)) {
          const normalizedFolders = ensureDefaultFolder(backendAssetFolders);
          setAssetFolders(normalizedFolders);
          void saveStoredList(STORAGE_KEYS.ASSET_FOLDERS, normalizedFolders);
        }
        if (Array.isArray(backendSubmissions)) {
          setSubmissions(backendSubmissions);
          void saveStoredList(STORAGE_KEYS.SUBMISSIONS, backendSubmissions);
        }
        if (Array.isArray(backendFeed)) {
          setAmbassadorFeed(backendFeed);
          void saveStoredList(STORAGE_KEYS.AMBASSADOR_FEED, backendFeed);
        }
        if (Array.isArray(backendExtraContent)) {
          setExtraContent(backendExtraContent);
          void saveStoredList(STORAGE_KEYS.EXTRA_CONTENT, backendExtraContent);
        }

        if (storedRsvps) {
          try {
            const parsed = JSON.parse(storedRsvps);
            if (parsed && typeof parsed === 'object') setRsvpStates(parsed);
          } catch (e) {
            console.log('[AppContext] Error parsing rsvps:', e);
          }
        }

        console.log(
          '[AppContext] Data loaded from backend - Tasks:',
          Array.isArray(backendTasks) ? backendTasks.length : 'unchanged',
          'Events:',
          Array.isArray(backendEvents) ? backendEvents.length : 'unchanged',
          'Assets:',
          Array.isArray(backendAssets) ? backendAssets.length : 'unchanged',
          'Submissions:',
          Array.isArray(backendSubmissions) ? backendSubmissions.length : 'unchanged'
        );
        return;
      }

      const [
        storedTasks,
        storedEvents,
        storedAssets,
        storedAssetFolders,
        storedSubmissions,
        storedFeed,
        storedExtraContent,
        storedRsvps,
      ] = await Promise.all([
        loadStoredList(STORAGE_KEYS.TASKS, mockTasks),
        loadStoredList(STORAGE_KEYS.EVENTS, mockEvents),
        loadStoredList(STORAGE_KEYS.ASSETS, mockAssets),
        loadStoredList(STORAGE_KEYS.ASSET_FOLDERS, BACKEND_CACHE_FALLBACKS.ASSET_FOLDERS),
        loadStoredList(STORAGE_KEYS.SUBMISSIONS, mockSubmissions),
        loadStoredList(STORAGE_KEYS.AMBASSADOR_FEED, mockAmbassadorPosts),
        loadStoredList(STORAGE_KEYS.EXTRA_CONTENT, [] as ExtraContentSubmission[]),
        AsyncStorage.getItem(STORAGE_KEYS.RSVPS).catch(() => null),
      ]);

      setTasks(storedTasks);
      setEvents(storedEvents);
      setAssets(storedAssets.map(asset => ({ ...asset, folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID })));
      setAssetFolders(ensureDefaultFolder(storedAssetFolders));
      setSubmissions(storedSubmissions);
      setAmbassadorFeed(storedFeed);
      setExtraContent(storedExtraContent);

      if (storedRsvps) {
        try {
          const parsed = JSON.parse(storedRsvps);
          if (parsed && typeof parsed === 'object') setRsvpStates(parsed);
        } catch (e) {
          console.log('[AppContext] Error parsing rsvps:', e);
        }
      }

      console.log('[AppContext] Data loaded from local storage - Tasks:', storedTasks.length, 'Events:', storedEvents.length, 'Assets:', storedAssets.length, 'Submissions:', storedSubmissions.length);
    } catch (error) {
      console.log('[AppContext] Error loading data:', error);
    }
  }, []);

  useEffect(() => {
    console.log('[AppContext] useEffect running...');
    let isMounted = true;

    const loadData = async () => {
      await fetchAllData();
      if (isMounted) {
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [fetchAllData]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchAllData();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAllData]);

  const addSubmission = useCallback(async (submission: Submission, userId: string) => {
    try {
      if (BACKEND_ENABLED) {
        const result = await trpcClient.submissions.create.mutate({
          taskId: submission.taskId,
          userId,
          platform: submission.platform,
          postUrl: submission.postUrl,
          platforms: submission.platforms,
          links: submission.links,
          screenshotUrl: submission.screenshotUrl,
          notes: submission.notes,
        });
        await syncSubmissionViewsFromBackend();
        
        console.log('[AppContext] Submission added to backend:', result.id, 'by user:', userId);
        return { success: true, submission: result };
      }

      setSubmissions(prev => {
        const updated = [submission, ...prev];
        void saveStoredList(STORAGE_KEYS.SUBMISSIONS, updated);
        return updated;
      });
      setTasks(prev => {
        const updated = prev.map(t => 
          t.id === submission.taskId 
            ? { ...t, submissions: (t.submissions || 0) + 1 }
            : t
        );
        void saveStoredList(STORAGE_KEYS.TASKS, updated);
        return updated;
      });

      console.log('[AppContext] Submission added locally:', submission.id, 'by user:', userId);
      return { success: true, submission };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to add submission';
      console.log('[AppContext] Error adding submission:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, [syncSubmissionViewsFromBackend]);

  const updateSubmission = useCallback(async (
    submissionId: string,
    userId: string,
    updates: {
      platform: Submission['platform'];
      postUrl: string;
      platforms?: Submission['platforms'];
      links?: Submission['links'];
      screenshotUrl?: string;
      notes?: string;
    }
  ) => {
    try {
      if (BACKEND_ENABLED) {
        const result = await trpcClient.submissions.update.mutate({
          id: submissionId,
          userId,
          platform: updates.platform,
          postUrl: updates.postUrl,
          platforms: updates.platforms,
          links: updates.links,
          screenshotUrl: updates.screenshotUrl,
          notes: updates.notes,
        });
        await syncSubmissionViewsFromBackend();
        return { success: true, submission: result };
      }

      setSubmissions(prev => {
        const updated = prev.map(s =>
          s.id === submissionId && s.userId === userId && (s.status === 'pending' || s.status === 'needs_edits')
            ? {
                ...s,
                platform: updates.platform,
                postUrl: updates.postUrl,
                platforms: updates.platforms,
                links: updates.links,
                screenshotUrl: updates.screenshotUrl,
                notes: updates.notes,
                status: 'pending' as const,
                feedback: undefined,
                rating: undefined,
                reviewedAt: undefined,
                submittedAt: new Date().toISOString(),
              }
            : s
        );
        void saveStoredList(STORAGE_KEYS.SUBMISSIONS, updated);
        return updated;
      });
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to update submission';
      console.log('[AppContext] Error updating submission:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, [syncSubmissionViewsFromBackend]);

  const reviewSubmission = useCallback(async (
    submissionId: string, 
    status: Submission['status'], 
    rating?: SubmissionRating,
    feedback?: string,
    metrics?: { impressions: number; likes: number; comments: number; shares: number }
  ) => {
    try {
      const reviewStatus = status as 'approved' | 'needs_edits' | 'rejected';

      if (BACKEND_ENABLED) {
        await trpcClient.submissions.review.mutate({
          id: submissionId,
          status: reviewStatus,
          rating,
          feedback,
          metrics,
        });
        await syncSubmissionViewsFromBackend();

        console.log('[AppContext] Submission reviewed in backend:', submissionId, status);
        return { success: true };
      }

      setSubmissions(prev => {
        const updated = prev.map(s => 
          s.id === submissionId 
            ? { 
                ...s, 
                status, 
                rating, 
                feedback, 
                metrics,
                reviewedAt: new Date().toISOString(),
              }
            : s
        );
        void saveStoredList(STORAGE_KEYS.SUBMISSIONS, updated);
        return updated;
      });

      console.log('[AppContext] Submission reviewed locally:', submissionId, status);
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to review submission';
      console.log('[AppContext] Error reviewing submission:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, [syncSubmissionViewsFromBackend]);

  const updateRsvp = useCallback(async (eventId: string, isRsvped: boolean) => {
    const updatedRsvps = { ...rsvpStates, [eventId]: isRsvped };
    setRsvpStates(updatedRsvps);
    
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.RSVPS, JSON.stringify(updatedRsvps));

      if (BACKEND_ENABLED) {
        await trpcClient.events.updateRsvp.mutate({ id: eventId, isRsvped });
        
        setEvents(prev => prev.map(e => 
          e.id === eventId 
            ? { ...e, attendees: e.attendees + (isRsvped ? 1 : -1), isRsvped }
            : e
        ));
        
        console.log('[AppContext] RSVP updated for event:', eventId, isRsvped);
      } else {
        setEvents(prev => {
          const updated = prev.map(e => 
            e.id === eventId 
              ? { ...e, attendees: e.attendees + (isRsvped ? 1 : -1), isRsvped }
              : e
          );
          void saveStoredList(STORAGE_KEYS.EVENTS, updated);
          return updated;
        });
        console.log('[AppContext] RSVP updated locally for event:', eventId, isRsvped);
      }
    } catch (error) {
      console.log('[AppContext] Error saving RSVP:', error);
    }
  }, [rsvpStates]);

  const addTask = useCallback(async (task: Omit<Task, 'id'>) => {
    try {
      console.log('[AppContext] Creating task:', task.title, 'campaign:', task.campaignTitle);
      if (BACKEND_ENABLED) {
        const result = await trpcClient.tasks.create.mutate({
          campaignId: task.campaignId,
          campaignTitle: task.campaignTitle,
          title: task.title,
          brief: task.brief,
          thumbnail: task.thumbnail,
          platforms: task.platforms,
          hashtags: task.hashtags,
          mentions: task.mentions,
          dos: task.dos,
          donts: task.donts,
          deadline: task.deadline,
          points: task.points,
          maxSubmissions: task.maxSubmissions,
        });
        
        setTasks(prev => [result, ...prev]);
        
        console.log('[AppContext] Task added to backend:', result.id);
        return { success: true, task: result };
      }

      const newTask: Task = { ...task, id: `task-${Date.now()}` };
      setTasks(prev => {
        const updated = [newTask, ...prev];
        void saveStoredList(STORAGE_KEYS.TASKS, updated);
        return updated;
      });
      
      console.log('[AppContext] Task added locally:', newTask.id);
      return { success: true, task: newTask };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to save task';
      console.log('[AppContext] Error adding task:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    try {
      if (BACKEND_ENABLED) {
        const { campaignId, campaignTitle, submissions, id, assetIds, ...validUpdates } = updates as Task;
        await trpcClient.tasks.update.mutate({
          id: taskId,
          ...validUpdates,
        });
        
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
        
        console.log('[AppContext] Task updated in backend:', taskId);
        return { success: true };
      }

      setTasks(prev => {
        const updated = prev.map(t => t.id === taskId ? { ...t, ...updates } : t);
        void saveStoredList(STORAGE_KEYS.TASKS, updated);
        return updated;
      });
      console.log('[AppContext] Task updated locally:', taskId);
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to update task';
      console.log('[AppContext] Error updating task:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      if (BACKEND_ENABLED) {
        await trpcClient.tasks.delete.mutate({ id: taskId });
        
        setTasks(prev => prev.filter(t => t.id !== taskId));
        
        console.log('[AppContext] Task deleted from backend:', taskId);
        return { success: true };
      }

      setTasks(prev => {
        const updated = prev.filter(t => t.id !== taskId);
        void saveStoredList(STORAGE_KEYS.TASKS, updated);
        return updated;
      });

      console.log('[AppContext] Task deleted locally:', taskId);
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to delete task';
      console.log('[AppContext] Error deleting task:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const addAsset = useCallback(async (asset: Omit<Asset, 'id' | 'createdAt' | 'downloadCount'>) => {
    try {
      if (BACKEND_ENABLED) {
        const result = await trpcClient.assets.create.mutate({
          name: asset.name,
          type: asset.type,
          folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID,
          url: asset.url,
          thumbnail: asset.thumbnail,
          campaignId: asset.campaignId,
          campaignTitle: asset.campaignTitle,
          platforms: asset.platforms,
          format: asset.format,
          size: asset.size,
        });
        
        setAssets(prev => [{ ...result, folderId: result.folderId || DEFAULT_ASSET_FOLDER_ID }, ...prev]);
        
        console.log('[AppContext] Asset added to backend:', result.id);
        return { success: true, asset: result };
      }

      const newAsset: Asset = {
        ...asset,
        folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID,
        id: `asset-${Date.now()}`,
        downloadCount: 0,
        createdAt: new Date().toISOString(),
      };
      setAssets(prev => {
        const updated = [newAsset, ...prev];
        void saveStoredList(STORAGE_KEYS.ASSETS, updated);
        return updated;
      });
      
      console.log('[AppContext] Asset added locally:', newAsset.id);
      return { success: true, asset: newAsset };
    } catch (error) {
      console.log('[AppContext] Error adding asset:', error);
      return { success: false, error: 'Failed to save asset' };
    }
  }, []);

  const updateAsset = useCallback(async (assetId: string, updates: Partial<Asset>) => {
    try {
      if (BACKEND_ENABLED) {
        await trpcClient.assets.update.mutate({
          id: assetId,
          ...updates,
        });
        
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, ...updates } : a));
        
        console.log('[AppContext] Asset updated in backend:', assetId);
        return { success: true };
      }

      setAssets(prev => {
        const updated = prev.map(a => a.id === assetId ? { ...a, ...updates } : a);
        void saveStoredList(STORAGE_KEYS.ASSETS, updated);
        return updated;
      });
      console.log('[AppContext] Asset updated locally:', assetId);
      return { success: true };
    } catch (error) {
      console.log('[AppContext] Error updating asset:', error);
      return { success: false, error: 'Failed to update asset' };
    }
  }, []);

  const deleteAsset = useCallback(async (assetId: string) => {
    try {
      if (BACKEND_ENABLED) {
        await trpcClient.assets.delete.mutate({ id: assetId });
        
        setAssets(prev => prev.filter(a => a.id !== assetId));
        
        console.log('[AppContext] Asset deleted from backend:', assetId);
        return { success: true };
      }

      setAssets(prev => {
        const updated = prev.filter(a => a.id !== assetId);
        void saveStoredList(STORAGE_KEYS.ASSETS, updated);
        return updated;
      });
      console.log('[AppContext] Asset deleted locally:', assetId);
      return { success: true };
    } catch (error) {
      console.log('[AppContext] Error deleting asset:', error);
      return { success: false, error: 'Failed to delete asset' };
    }
  }, []);

  const incrementAssetDownload = useCallback(async (assetId: string) => {
    try {
      if (BACKEND_ENABLED) {
        const updated = await trpcClient.assets.incrementDownload.mutate({ id: assetId });
        if (updated) {
          setAssets(prev => prev.map(a => a.id === assetId ? { ...a, downloadCount: updated.downloadCount } : a));
        }
        return { success: true };
      }

      setAssets(prev => {
        const updated = prev.map(a =>
          a.id === assetId
            ? { ...a, downloadCount: (a.downloadCount || 0) + 1 }
            : a
        );
        void saveStoredList(STORAGE_KEYS.ASSETS, updated);
        return updated;
      });
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to track download';
      console.log('[AppContext] Error incrementing asset download:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const addAssetFolder = useCallback(async (folder: { name: string; color?: string }) => {
    try {
      if (BACKEND_ENABLED) {
        const created = await trpcClient.assets.createFolder.mutate({
          name: folder.name,
          color: folder.color,
        });
        setAssetFolders(prev => ensureDefaultFolder([...prev, created]));
        return { success: true, folder: created };
      }

      const created: AssetFolder = {
        id: `folder-${Date.now()}`,
        name: folder.name.trim(),
        color: folder.color || '#6366F1',
        createdAt: new Date().toISOString(),
      };
      setAssetFolders(prev => {
        const updated = ensureDefaultFolder([...prev, created]);
        void saveStoredList(STORAGE_KEYS.ASSET_FOLDERS, updated);
        return updated;
      });
      return { success: true, folder: created };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to create folder';
      console.log('[AppContext] Error creating asset folder:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const updateAssetFolder = useCallback(async (folderId: string, updates: { name?: string; color?: string }) => {
    try {
      if (BACKEND_ENABLED) {
        const updated = await trpcClient.assets.updateFolder.mutate({
          id: folderId,
          ...updates,
        });
        setAssetFolders(prev => ensureDefaultFolder(prev.map(folder => folder.id === folderId ? updated : folder)));
        return { success: true };
      }

      setAssetFolders(prev => {
        const updated = ensureDefaultFolder(prev.map(folder => (
          folder.id === folderId
            ? { ...folder, ...updates, updatedAt: new Date().toISOString() }
            : folder
        )));
        void saveStoredList(STORAGE_KEYS.ASSET_FOLDERS, updated);
        return updated;
      });
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to update folder';
      console.log('[AppContext] Error updating asset folder:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const deleteAssetFolder = useCallback(async (folderId: string) => {
    if (folderId === DEFAULT_ASSET_FOLDER_ID) {
      return { success: false, error: 'Default folder cannot be deleted' };
    }

    try {
      if (BACKEND_ENABLED) {
        await trpcClient.assets.deleteFolder.mutate({ id: folderId });
        setAssetFolders(prev => ensureDefaultFolder(prev.filter(folder => folder.id !== folderId)));
        setAssets(prev => prev.map(asset => asset.folderId === folderId ? { ...asset, folderId: DEFAULT_ASSET_FOLDER_ID } : asset));
        return { success: true };
      }

      setAssetFolders(prev => {
        const updated = ensureDefaultFolder(prev.filter(folder => folder.id !== folderId));
        void saveStoredList(STORAGE_KEYS.ASSET_FOLDERS, updated);
        return updated;
      });
      setAssets(prev => {
        const updated = prev.map(asset => asset.folderId === folderId ? { ...asset, folderId: DEFAULT_ASSET_FOLDER_ID } : asset);
        void saveStoredList(STORAGE_KEYS.ASSETS, updated);
        return updated;
      });
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to delete folder';
      console.log('[AppContext] Error deleting asset folder:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const addEvent = useCallback(async (event: Omit<Event, 'id' | 'attendees' | 'isRsvped'>) => {
    try {
      if (BACKEND_ENABLED) {
        const result = await trpcClient.events.create.mutate({
          title: event.title,
          description: event.description,
          type: event.type,
          thumbnail: event.thumbnail,
          date: event.date,
          time: event.time,
          location: event.location,
          timezone: event.timezone,
          maxAttendees: event.maxAttendees,
          link: event.link,
        });
        
        setEvents(prev => [result, ...prev]);
        
        console.log('[AppContext] Event added to backend:', result.id);
        return { success: true, event: result };
      }

      const newEvent: Event = {
        ...event,
        id: `event-${Date.now()}`,
        attendees: 0,
        isRsvped: false,
      };
      setEvents(prev => {
        const updated = [newEvent, ...prev];
        void saveStoredList(STORAGE_KEYS.EVENTS, updated);
        return updated;
      });
      
      console.log('[AppContext] Event added locally:', newEvent.id);
      return { success: true, event: newEvent };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to save event';
      console.log('[AppContext] Error adding event:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const updateEvent = useCallback(async (eventId: string, updates: Partial<Event>) => {
    try {
      if (BACKEND_ENABLED) {
        await trpcClient.events.update.mutate({
          id: eventId,
          ...updates,
        });
        
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updates } : e));
        
        console.log('[AppContext] Event updated in backend:', eventId);
        return { success: true };
      }

      setEvents(prev => {
        const updated = prev.map(e => e.id === eventId ? { ...e, ...updates } : e);
        void saveStoredList(STORAGE_KEYS.EVENTS, updated);
        return updated;
      });
      console.log('[AppContext] Event updated locally:', eventId);
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to update event';
      console.log('[AppContext] Error updating event:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, []);

  const deleteEvent = useCallback(async (eventId: string) => {
    try {
      if (BACKEND_ENABLED) {
        await trpcClient.events.delete.mutate({ id: eventId });
        
        setEvents(prev => prev.filter(e => e.id !== eventId));
        
        const updatedRsvps = { ...rsvpStates };
        delete updatedRsvps[eventId];
        setRsvpStates(updatedRsvps);
        await AsyncStorage.setItem(STORAGE_KEYS.RSVPS, JSON.stringify(updatedRsvps));
        
        console.log('[AppContext] Event deleted from backend:', eventId);
        return { success: true };
      }

      setEvents(prev => {
        const updated = prev.filter(e => e.id !== eventId);
        void saveStoredList(STORAGE_KEYS.EVENTS, updated);
        return updated;
      });

      const updatedRsvps = { ...rsvpStates };
      delete updatedRsvps[eventId];
      setRsvpStates(updatedRsvps);
      await AsyncStorage.setItem(STORAGE_KEYS.RSVPS, JSON.stringify(updatedRsvps));

      console.log('[AppContext] Event deleted locally:', eventId);
      return { success: true };
    } catch (error) {
      console.log('[AppContext] Error deleting event:', error);
      return { success: false, error: 'Failed to delete event' };
    }
  }, [rsvpStates]);

  const deleteSubmission = useCallback(async (submissionId: string) => {
    try {
      if (BACKEND_ENABLED) {
        await trpcClient.submissions.delete.mutate({ id: submissionId });
        await syncSubmissionViewsFromBackend();
        
        console.log('[AppContext] Submission deleted from backend:', submissionId);
        return { success: true };
      }

      setSubmissions(prev => {
        const updated = prev.filter(s => s.id !== submissionId);
        void saveStoredList(STORAGE_KEYS.SUBMISSIONS, updated);
        return updated;
      });

      console.log('[AppContext] Submission deleted locally:', submissionId);
      return { success: true };
    } catch (error) {
      console.log('[AppContext] Error deleting submission:', error);
      return { success: false, error: 'Failed to delete submission' };
    }
  }, [syncSubmissionViewsFromBackend]);

  const addExtraContent = useCallback(async (postUrl: string, userId: string) => {
    try {
      if (BACKEND_ENABLED) {
        const result = await trpcClient.extraContent.create.mutate({ userId, postUrl });
        const backendExtraContent = await trpcClient.extraContent.list.query().catch(() => null);
        if (Array.isArray(backendExtraContent)) {
          setExtraContent(backendExtraContent);
          void saveStoredList(STORAGE_KEYS.EXTRA_CONTENT, backendExtraContent);
        } else {
          setExtraContent(prev => [result, ...prev]);
        }
        return { success: true, extraContent: result };
      }

      const match = postUrl.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{8,})/i);
      if (!match?.[1] || !match?.[2]) {
        return { success: false, error: 'Enter a valid X post URL' };
      }
      const tweetId = match[2];
      if (extraContent.some((item) => item.tweetId === tweetId) || submissions.some((item) => item.postUrl.includes(tweetId) || item.links?.some((link) => link.url.includes(tweetId)))) {
        return { success: false, error: 'This X post has already been submitted' };
      }

      const createdAt = Date.now();
      const newItem: ExtraContentSubmission = {
        id: `extra-x-${createdAt}`,
        seasonId: undefined,
        userId,
        platform: 'twitter',
        postUrl: postUrl.trim(),
        canonicalUrl: `https://twitter.com/${match[1]}/status/${tweetId}`,
        tweetId,
        authorHandle: match[1].toLowerCase(),
        status: 'tracking',
        submittedAt: new Date(createdAt).toISOString(),
        xTrackingExpiresAt: new Date(createdAt + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metrics: { impressions: 0, likes: 0, comments: 0, shares: 0 },
      };
      const updated = [newItem, ...extraContent];
      setExtraContent(updated);
      void saveStoredList(STORAGE_KEYS.EXTRA_CONTENT, updated);
      return { success: true, extraContent: newItem };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to submit extra X content';
      console.log('[AppContext] Error adding extra content:', errMsg, error);
      return { success: false, error: errMsg };
    }
  }, [extraContent, submissions]);

  const getUserSubmissionForTask = useCallback((userId: string, taskId: string) => {
    return submissions.find(s => s.userId === userId && s.taskId === taskId);
  }, [submissions]);

  const hasUserSubmittedTask = useCallback((userId: string, taskId: string) => {
    return submissions.some(
      (s) => s.userId === userId && s.taskId === taskId && s.status !== 'rejected'
    );
  }, [submissions]);

  const allSubmissions = submissions;
  const pendingSubmissions = submissions.filter(s => s.status === 'pending');

  return {
    submissions,
    allSubmissions,
    pendingSubmissions,
    tasks,
    assets,
    assetFolders,
    events,
    rsvpStates,
    isRefreshing,
    isLoading,
    ambassadorFeed,
    extraContent,
    addSubmission,
    updateSubmission,
    reviewSubmission,
    updateRsvp,
    refreshData,
    addTask,
    updateTask,
    deleteTask,
    addAsset,
    updateAsset,
    deleteAsset,
    incrementAssetDownload,
    addAssetFolder,
    updateAssetFolder,
    deleteAssetFolder,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteSubmission,
    addExtraContent,
    getUserSubmissionForTask,
    hasUserSubmittedTask,
  };
});

export function useUserExtraContent(userId: string | undefined) {
  const { extraContent } = useApp();
  return [...extraContent]
    .filter(item => item.userId === userId)
    .sort((a, b) =>
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
}

export function useUserSubmissions(userId: string | undefined) {
  const { submissions } = useApp();
  return [...submissions]
    .filter(s => s.userId === userId)
    .sort((a, b) => 
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
}
