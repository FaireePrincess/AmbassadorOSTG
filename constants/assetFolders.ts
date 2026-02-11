import type { AssetFolder } from '@/types';

export const DEFAULT_ASSET_FOLDER_ID = 'folder-general';

export const DEFAULT_ASSET_FOLDER: AssetFolder = {
  id: DEFAULT_ASSET_FOLDER_ID,
  name: 'General',
  color: '#6366F1',
  createdAt: new Date(0).toISOString(),
};

export function ensureDefaultFolder(folders: AssetFolder[]): AssetFolder[] {
  if (folders.some((folder) => folder.id === DEFAULT_ASSET_FOLDER_ID)) {
    return folders;
  }
  return [DEFAULT_ASSET_FOLDER, ...folders];
}
