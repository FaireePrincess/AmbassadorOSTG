export const AVATAR_PRESETS = [
  {
    id: 'grumpy-chick',
    label: 'Grumpy Chick',
    uri: 'https://pub-489363d241b04139bc82028f38d7f31b.r2.dev/Grumpy_Chick_PFP01.PNG',
  },
  {
    id: 'happy-boy',
    label: 'Happy Boy',
    uri: 'https://pub-489363d241b04139bc82028f38d7f31b.r2.dev/Happy_Boy_PFP.PNG',
  },
  {
    id: 'happy-girl',
    label: 'Happy Girl',
    uri: 'https://pub-489363d241b04139bc82028f38d7f31b.r2.dev/Happy_Girl_PFP.PNG',
  },
  {
    id: 'smiling-cat',
    label: 'Smiling Cat',
    uri: 'https://pub-489363d241b04139bc82028f38d7f31b.r2.dev/Smiling_cat_PFP.PNG',
  },
  {
    id: 'smirking-boy',
    label: 'Smirking Boy',
    uri: 'https://pub-489363d241b04139bc82028f38d7f31b.r2.dev/Smirking_Boy_PFP.PNG',
  },
  {
    id: 'unicorn',
    label: 'Unicorn',
    uri: 'https://pub-489363d241b04139bc82028f38d7f31b.r2.dev/Unicron_PFP.PNG',
  },
];

export const DEFAULT_AVATAR_URI = AVATAR_PRESETS[0].uri;

export function normalizeAvatarUri(value?: string | null): string {
  if (!value) return DEFAULT_AVATAR_URI;
  const isPreset = AVATAR_PRESETS.some((preset) => preset.uri === value);
  return isPreset ? value : DEFAULT_AVATAR_URI;
}
