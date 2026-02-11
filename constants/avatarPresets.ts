export const AVATAR_PRESETS = [
  {
    id: 'bear',
    label: 'Bear',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Bear&backgroundColor=c0aede',
  },
  {
    id: 'cat',
    label: 'Cat',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Cat&backgroundColor=fde68a',
  },
  {
    id: 'fox',
    label: 'Fox',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Fox&backgroundColor=fca5a5',
  },
  {
    id: 'panda',
    label: 'Panda',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Panda&backgroundColor=93c5fd',
  },
  {
    id: 'robot',
    label: 'Robot',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Robot&backgroundColor=86efac',
  },
  {
    id: 'alien',
    label: 'Alien',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Alien&backgroundColor=f9a8d4',
  },
  {
    id: 'wizard',
    label: 'Wizard',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Wizard&backgroundColor=d9f99d',
  },
  {
    id: 'ninja',
    label: 'Ninja',
    uri: 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Ninja&backgroundColor=fdba74',
  },
];

export const DEFAULT_AVATAR_URI = AVATAR_PRESETS[0].uri;

export function normalizeAvatarUri(value?: string | null): string {
  if (!value) return DEFAULT_AVATAR_URI;
  const isPreset = AVATAR_PRESETS.some((preset) => preset.uri === value);
  return isPreset ? value : DEFAULT_AVATAR_URI;
}
