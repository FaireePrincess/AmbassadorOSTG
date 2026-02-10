import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { Submission, SubmissionRating, Task, Asset, Event, AmbassadorPost } from '@/types';
import { 
  ambassadorPosts as mockAmbassadorPosts,
  tasks as mockTasks,
  assets as mockAssets,
  events as mockEvents,
  submissions as mockSubmissions,
} from '@/mocks/data';
import { trpcClient, isBackendEnabled } from '@/lib/trpc';

const STORAGE_KEYS = {
  RSVPS: 'ambassador_rsvps',
  AMBASSADOR_FEED: 'ambassador_feed',
  TASKS: 'ambassador_tasks',
  ASSETS: 'ambassador_assets',
  EVENTS: 'ambassador_events',
  SUBMISSIONS: 'ambassador_submissions',
};

const BACKEND_ENABLED = isBackendEnabled();

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
  const [events, setEvents] = useState<Event[]>([]);
  const [rsvpStates, setRsvpStates] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ambassadorFeed, setAmbassadorFeed] = useState<AmbassadorPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllData = useCallback(async () => {
    console.log('[AppContext] Loading all data from backend...');
    try {
      if (BACKEND_ENABLED) {
        const [
          backendTasks,
          backendEvents,
          backendAssets,
          backendSubmissions,
          storedRsvps,
        ] = await Promise.all([
          trpcClient.tasks.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch tasks from backend:', e);
            return [] as Task[];
          }),
          trpcClient.events.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch events from backend:', e);
            return [] as Event[];
          }),
          trpcClient.assets.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch assets from backend:', e);
            return [] as Asset[];
          }),
          trpcClient.submissions.list.query().catch((e) => {
            console.log('[AppContext] Failed to fetch submissions from backend:', e);
            return [] as Submission[];
          }),
          AsyncStorage.getItem(STORAGE_KEYS.RSVPS).catch(() => null),
        ]);

        setTasks(backendTasks);
        setEvents(backendEvents);
        setAssets(backendAssets);
        setSubmissions(backendSubmissions);
        setAmbassadorFeed(mockAmbassadorPosts);

        if (storedRsvps) {
          try {
            const parsed = JSON.parse(storedRsvps);
            if (parsed && typeof parsed === 'object') setRsvpStates(parsed);
          } catch (e) {
            console.log('[AppContext] Error parsing rsvps:', e);
          }
        }

        console.log('[AppContext] Data loaded from backend - Tasks:', backendTasks.length, 'Events:', backendEvents.length, 'Assets:', backendAssets.length, 'Submissions:', backendSubmissions.length);
        return;
      }

      const [
        storedTasks,
        storedEvents,
        storedAssets,
        storedSubmissions,
        storedRsvps,
      ] = await Promise.all([
        loadStoredList(STORAGE_KEYS.TASKS, mockTasks),
        loadStoredList(STORAGE_KEYS.EVENTS, mockEvents),
        loadStoredList(STORAGE_KEYS.ASSETS, mockAssets),
        loadStoredList(STORAGE_KEYS.SUBMISSIONS, mockSubmissions),
        AsyncStorage.getItem(STORAGE_KEYS.RSVPS).catch(() => null),
      ]);

      setTasks(storedTasks);
      setEvents(storedEvents);
      setAssets(storedAssets);
      setSubmissions(storedSubmissions);
      setAmbassadorFeed(mockAmbassadorPosts);

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
          screenshotUrl: submission.screenshotUrl,
          notes: submission.notes,
        });
        
        setSubmissions(prev => [result, ...prev]);
        setTasks(prev => prev.map(t => 
          t.id === submission.taskId 
            ? { ...t, submissions: (t.submissions || 0) + 1 }
            : t
        ));
        
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
  }, []);

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
        
        setSubmissions(prev => prev.map(s => 
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
        ));

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
  }, []);

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
          url: asset.url,
          thumbnail: asset.thumbnail,
          campaignId: asset.campaignId,
          campaignTitle: asset.campaignTitle,
          platforms: asset.platforms,
          format: asset.format,
          size: asset.size,
        });
        
        setAssets(prev => [result, ...prev]);
        
        console.log('[AppContext] Asset added to backend:', result.id);
        return { success: true, asset: result };
      }

      const newAsset: Asset = {
        ...asset,
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
      console.log('[AppContext] Error adding event:', error);
      return { success: false, error: 'Failed to save event' };
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
      console.log('[AppContext] Error updating event:', error);
      return { success: false, error: 'Failed to update event' };
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
        
        setSubmissions(prev => prev.filter(s => s.id !== submissionId));
        
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
  }, []);

  const getUserSubmissionForTask = useCallback((userId: string, taskId: string) => {
    return submissions.find(s => s.userId === userId && s.taskId === taskId);
  }, [submissions]);

  const hasUserSubmittedTask = useCallback((userId: string, taskId: string) => {
    return submissions.some(s => s.userId === userId && s.taskId === taskId);
  }, [submissions]);

  const allSubmissions = submissions;
  const pendingSubmissions = submissions.filter(s => s.status === 'pending');

  return {
    submissions,
    allSubmissions,
    pendingSubmissions,
    tasks,
    assets,
    events,
    rsvpStates,
    isRefreshing,
    isLoading,
    ambassadorFeed,
    addSubmission,
    reviewSubmission,
    updateRsvp,
    refreshData,
    addTask,
    updateTask,
    deleteTask,
    addAsset,
    updateAsset,
    deleteAsset,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteSubmission,
    getUserSubmissionForTask,
    hasUserSubmittedTask,
  };
});

export function useUserSubmissions(userId: string | undefined) {
  const { submissions } = useApp();
  return [...submissions]
    .filter(s => s.userId === userId)
    .sort((a, b) => 
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
}
