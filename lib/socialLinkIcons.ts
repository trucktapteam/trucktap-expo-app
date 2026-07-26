export type SocialBrandKey = 'facebook' | 'instagram' | 'tiktok';

export type SocialBrandIcon = {
  name: string;
  color: string;
};

export const SOCIAL_BRAND_ICONS: Record<SocialBrandKey, SocialBrandIcon> = {
  facebook: { name: 'facebook', color: '#1877F2' },
  instagram: { name: 'instagram', color: '#E4405F' },
  tiktok: { name: 'tiktok', color: '#000000' },
};

export function getSocialBrandIcon(key: string): SocialBrandIcon | null {
  return SOCIAL_BRAND_ICONS[key as SocialBrandKey] ?? null;
}
