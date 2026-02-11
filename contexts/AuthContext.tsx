import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@/types';
import { allUsers as mockUsers } from '@/mocks/data';
import { trpcClient, isBackendEnabled } from '@/lib/trpc';

const STORAGE_KEY = 'auth_user';
const USERS_STORAGE_KEY = 'app_users';
const BACKEND_ENABLED = isBackendEnabled();
const AUTO_LOGOUT_ON_BACKGROUND = true;

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  activateAccount: (email: string, inviteCode: string, password: string) => Promise<{ success: boolean; error?: string }>;
  createUser: (userData: Omit<User, 'id' | 'inviteCode' | 'status' | 'stats' | 'joinedAt'>) => Promise<{ success: boolean; inviteCode?: string; error?: string }>;
  updateUserStatus: (userId: string, status: User['status']) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (updates: {
    name?: string;
    avatar?: string;
    handles?: User['handles'];
    fslEmail?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (userId: string, newPassword: string, currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
  refreshUsers: () => Promise<void>;
  clearStorage: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoggingOutRef = useRef(false);

  const syncCurrentUserRecord = useCallback(async (updatedUsers: User[]) => {
    if (isLoggingOutRef.current) return;
    if (!currentUser) return;
    const latest = updatedUsers.find((u) => u.id === currentUser.id);
    if (!latest) return;

    setCurrentUser(latest);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
  }, [currentUser]);

  const loadUsers = useCallback(async () => {
    try {
      if (BACKEND_ENABLED) {
        const backendUsers = await trpcClient.users.list.query();
        setUsers(backendUsers);
        await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(backendUsers));
        await syncCurrentUserRecord(backendUsers);
        return backendUsers;
      }

      const storedUsers = await AsyncStorage.getItem(USERS_STORAGE_KEY);
      if (storedUsers) {
        const parsed = JSON.parse(storedUsers);
        setUsers(parsed);
        await syncCurrentUserRecord(parsed);
        return parsed;
      }
      // Initialize with mock users
      await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(mockUsers));
      setUsers(mockUsers);
      await syncCurrentUserRecord(mockUsers);
      return mockUsers;
    } catch (error) {
      console.log('[Auth] Error loading users:', error);
      if (BACKEND_ENABLED) {
        const storedUsers = await AsyncStorage.getItem(USERS_STORAGE_KEY);
        if (storedUsers) {
          const parsed = JSON.parse(storedUsers);
          setUsers(parsed);
          await syncCurrentUserRecord(parsed);
          return parsed;
        }
      }
      setUsers(mockUsers);
      await syncCurrentUserRecord(mockUsers);
      return mockUsers;
    }
  }, [syncCurrentUserRecord]);

  const saveUsers = useCallback(async (updatedUsers: User[]) => {
    try {
      await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
      setUsers(updatedUsers);
    } catch (error) {
      console.log('[Auth] Error saving users:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        // Load users from storage
        await loadUsers();
        
        // Check for existing session
        const rawUser = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;

        if (rawUser) {
          try {
            const user = JSON.parse(rawUser);
            if (user?.status === 'active') {
              setCurrentUser(user);
              console.log('[Auth] Restored session for:', user.email);
            } else {
              await AsyncStorage.removeItem(STORAGE_KEY);
            }
          } catch {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (error) {
        console.log('[Auth] Error during initial load:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [loadUsers]);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    console.log('[Auth] Attempting login for:', email);

    if (BACKEND_ENABLED) {
      try {
        const user = await trpcClient.users.login.mutate({ email, password });
        console.log('[Auth] Login successful (backend):', user.name);
        setCurrentUser(user);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed';
        console.log('[Auth] Backend login failed:', message);
        return { success: false, error: message };
      }
    }

    // Get latest users from storage
    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    
    const user = currentUsers.find((u: User) => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      console.log('[Auth] User not found:', email);
      return { success: false, error: 'Account not found. Contact admin for an invite.' };
    }
    
    if (user.status === 'pending') {
      return { success: false, error: 'Your account is pending activation. Please use your invite code to activate.' };
    }
    
    if (user.status === 'suspended') {
      return { success: false, error: 'Your account has been suspended. Contact admin for help.' };
    }
    
    if (user.password !== password) {
      console.log('[Auth] Invalid password for:', email);
      return { success: false, error: 'Invalid password' };
    }
    
    console.log('[Auth] Login successful:', user.name);
    setCurrentUser(user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return { success: true };
  }, []);

  const activateAccount = useCallback(async (email: string, inviteCode: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (BACKEND_ENABLED) {
      try {
        const activatedUser = await trpcClient.users.activate.mutate({ email, inviteCode, password });
        setCurrentUser(activatedUser);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activatedUser));
        await loadUsers();
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Activation failed';
        return { success: false, error: message };
      }
    }

    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers: User[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    
    const userIndex = currentUsers.findIndex((u: User) => u.email.toLowerCase() === email.toLowerCase());
    
    if (userIndex === -1) {
      return { success: false, error: 'Account not found' };
    }
    
    const user = currentUsers[userIndex];
    
    if (user.status !== 'pending') {
      return { success: false, error: 'Account is already activated' };
    }
    
    if (user.inviteCode !== inviteCode) {
      return { success: false, error: 'Invalid invite code' };
    }
    
    const activatedUser: User = {
      ...user,
      password,
      status: 'active',
      activatedAt: new Date().toISOString().split('T')[0],
    };
    
    currentUsers[userIndex] = activatedUser;
    await saveUsers(currentUsers);
    
    setCurrentUser(activatedUser);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activatedUser));
    
    return { success: true };
  }, [saveUsers, loadUsers]);

  const logout = useCallback(async () => {
    isLoggingOutRef.current = true;
    setCurrentUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (!AUTO_LOGOUT_ON_BACKGROUND) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && currentUser) {
        void logout();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [currentUser, logout]);

  const generateInviteCode = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'FSL';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }, []);

  const createUser = useCallback(async (userData: Omit<User, 'id' | 'inviteCode' | 'status' | 'stats' | 'joinedAt'>): Promise<{ success: boolean; inviteCode?: string; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Only admins can create users' };
    }

    if (BACKEND_ENABLED) {
      try {
        const newUser = await trpcClient.users.create.mutate({
          name: userData.name,
          email: userData.email,
          role: userData.role,
          region: userData.region,
          fslEmail: userData.fslEmail,
          handles: userData.handles || {},
        });
        await loadUsers();
        console.log('[Auth] User created (backend):', newUser.email, 'Invite code:', newUser.inviteCode);
        return { success: true, inviteCode: newUser.inviteCode };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create user';
        return { success: false, error: message };
      }
    }

    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers: User[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    
    const existingUser = currentUsers.find((u: User) => u.email.toLowerCase() === userData.email.toLowerCase());
    if (existingUser) {
      return { success: false, error: 'User with this email already exists' };
    }

    const inviteCode = generateInviteCode();
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: userData.name,
      avatar: userData.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=150&h=150&fit=crop',
      email: userData.email,
      role: userData.role,
      region: userData.region,
      handles: userData.handles || {},
      points: 0,
      rank: 0,
      status: 'pending',
      inviteCode,
      stats: {
        totalPosts: 0,
        totalImpressions: 0,
        totalLikes: 0,
        totalRetweets: 0,
        completedTasks: 0,
      },
      joinedAt: new Date().toISOString().split('T')[0],
    };

    const updatedUsers = [...currentUsers, newUser];
    await saveUsers(updatedUsers);
    
    console.log('[Auth] User created:', newUser.email, 'Invite code:', inviteCode);
    return { success: true, inviteCode };
  }, [currentUser, saveUsers, generateInviteCode, loadUsers]);

  const updateUserStatus = useCallback(async (userId: string, status: User['status']): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Only admins can update user status' };
    }

    if (BACKEND_ENABLED) {
      try {
        await trpcClient.users.update.mutate({ id: userId, status });
        await loadUsers();
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update status';
        return { success: false, error: message };
      }
    }

    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers: User[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    
    const userIndex = currentUsers.findIndex((u: User) => u.id === userId);
    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    currentUsers[userIndex] = { ...currentUsers[userIndex], status };
    await saveUsers(currentUsers);
    
    return { success: true };
  }, [currentUser, saveUsers, loadUsers]);

  const deleteUser = useCallback(async (userId: string): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Only admins can delete users' };
    }

    if (BACKEND_ENABLED) {
      try {
        const user = users.find((u) => u.id === userId);
        if (!user) return { success: false, error: 'User not found' };
        if (user.status !== 'suspended') {
          return { success: false, error: 'Only suspended users can be deleted' };
        }
        await trpcClient.users.delete.mutate({ id: userId });
        await loadUsers();
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete user';
        return { success: false, error: message };
      }
    }

    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers: User[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    
    const user = currentUsers.find((u: User) => u.id === userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.status !== 'suspended') {
      return { success: false, error: 'Only suspended users can be deleted' };
    }

    const updatedUsers = currentUsers.filter((u: User) => u.id !== userId);
    await saveUsers(updatedUsers);
    
    return { success: true };
  }, [currentUser, saveUsers, users, loadUsers]);

  const updateProfile = useCallback(async (updates: {
    name?: string;
    avatar?: string;
    handles?: User['handles'];
    fslEmail?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'No active user session' };
    }

    if (BACKEND_ENABLED) {
      try {
        const updated = await trpcClient.users.update.mutate({
          id: currentUser.id,
          name: updates.name,
          avatar: updates.avatar,
          handles: updates.handles,
          fslEmail: updates.fslEmail,
        });

        setCurrentUser(updated);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        await loadUsers();
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update profile';
        return { success: false, error: message };
      }
    }

    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers: User[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    const userIndex = currentUsers.findIndex((u: User) => u.id === currentUser.id);
    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    const updatedUser: User = {
      ...currentUsers[userIndex],
      ...updates,
      handles: updates.handles ?? currentUsers[userIndex].handles,
    };

    currentUsers[userIndex] = updatedUser;
    await saveUsers(currentUsers);
    setCurrentUser(updatedUser);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    return { success: true };
  }, [currentUser, loadUsers, saveUsers]);

  const changePassword = useCallback(async (userId: string, newPassword: string, currentPassword?: string): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.id !== userId && currentUser?.role !== 'admin') {
      return { success: false, error: 'You can only change your own password' };
    }

    if (BACKEND_ENABLED) {
      try {
        await trpcClient.users.changePassword.mutate({
          id: userId,
          newPassword,
          currentPassword,
        });
        await loadUsers();

        if (currentUser?.id === userId) {
          const updatedUser = { ...currentUser, password: newPassword };
          setCurrentUser(updatedUser);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        }
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to change password';
        return { success: false, error: message };
      }
    }

    const storedUsersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
    const currentUsers: User[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : mockUsers;
    
    const userIndex = currentUsers.findIndex((u: User) => u.id === userId);
    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    const user = currentUsers[userIndex];

    // Non-admins must verify current password
    if (currentUser?.role !== 'admin' && currentPassword !== user.password) {
      return { success: false, error: 'Current password is incorrect' };
    }

    currentUsers[userIndex] = { ...user, password: newPassword };
    await saveUsers(currentUsers);

    // Update current user session if they changed their own password
    if (currentUser?.id === userId) {
      const updatedUser = { ...currentUser, password: newPassword };
      setCurrentUser(updatedUser);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    }
    
    return { success: true };
  }, [currentUser, saveUsers, loadUsers]);

  const refreshUsers = useCallback(async () => {
    await loadUsers();
  }, [loadUsers]);

  const clearStorage = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(USERS_STORAGE_KEY);
    setCurrentUser(null);
    setUsers(mockUsers);
  }, []);

  const isAuthenticated = currentUser !== null;
  const isAdmin = currentUser?.role === 'admin';

  const value = useMemo(() => ({
    currentUser,
    users,
    isAuthenticated,
    isLoading,
    isAdmin,
    login,
    logout,
    activateAccount,
    createUser,
    updateUserStatus,
    deleteUser,
    updateProfile,
    changePassword,
    refreshUsers,
    clearStorage,
  }), [currentUser, users, isAuthenticated, isLoading, isAdmin, login, logout, activateAccount, createUser, updateUserStatus, deleteUser, updateProfile, changePassword, refreshUsers, clearStorage]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
