import { Platform } from 'react-native';

const DEFAULT_PUBLIC_WEB_BASE_URL = 'https://luxury-horse-2960dd.netlify.app';

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

export function getTruckPublicBaseUrl(): string {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_TRUCK_PUBLIC_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.host;
    if (
      host &&
      !host.includes('localhost') &&
      !host.includes('127.0.0.1') &&
      !host.includes('192.168')
    ) {
      return normalizeBaseUrl(window.location.origin);
    }
  }

  return DEFAULT_PUBLIC_WEB_BASE_URL;
}

export function buildTruckPublicUrl(truckId?: string | null): string {
  if (!truckId) {
    return '';
  }

  return `${getTruckPublicBaseUrl()}/public/${encodeURIComponent(truckId)}`;
}
