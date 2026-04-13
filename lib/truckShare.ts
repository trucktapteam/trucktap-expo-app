const DEFAULT_PUBLIC_WEB_BASE_URL = 'https://gettrucktap.com';
const DEFAULT_APP_SCHEME = 'trucktap';

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const sanitizeTruckId = (truckId?: string | null): string => {
  const normalized = truckId?.toString().trim() ?? '';
  return normalized.length > 0 ? normalized : '';
};

export function getTruckPublicBaseUrl(): string {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_TRUCK_PUBLIC_BASE_URL?.trim();
  return normalizeBaseUrl(configuredBaseUrl || DEFAULT_PUBLIC_WEB_BASE_URL);
}

export function getTruckAppScheme(): string {
  const configuredScheme = process.env.EXPO_PUBLIC_TRUCK_APP_SCHEME?.trim();
  return configuredScheme || DEFAULT_APP_SCHEME;
}

export function getTruckAppPath(truckId?: string | null): string {
  const normalizedTruckId = sanitizeTruckId(truckId);
  return normalizedTruckId ? `/truck/${encodeURIComponent(normalizedTruckId)}` : '';
}

export function getTruckDeepLink(truckId?: string | null): string {
  const appPath = getTruckAppPath(truckId);
  return appPath ? `${getTruckAppScheme()}:/${appPath}` : '';
}

export function getTruckWebUrl(truckId?: string | null): string {
  const appPath = getTruckAppPath(truckId);
  return appPath ? `${getTruckPublicBaseUrl()}${appPath}` : '';
}

export function getTruckShareUrl(truckId?: string | null): string {
  return getTruckWebUrl(truckId);
}

export function buildTruckPublicUrl(truckId?: string | null): string {
  return getTruckShareUrl(truckId);
}

export function getTruckRouteFromUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const rawPath = parsed.pathname.replace(/\/+$/, '');
    const pathSegments = rawPath.split('/').filter(Boolean);

    if (parsed.protocol === `${getTruckAppScheme()}:`) {
      if (host === 'truck' && pathSegments[0]) {
        return `/truck/${decodeURIComponent(pathSegments[0])}`;
      }

      if (pathSegments[0] === 'truck' && pathSegments[1]) {
        return `/truck/${decodeURIComponent(pathSegments[1])}`;
      }
    }

    if ((host === 'gettrucktap.com' || host === 'www.gettrucktap.com') && pathSegments[0] === 'truck' && pathSegments[1]) {
      return `/truck/${decodeURIComponent(pathSegments[1])}`;
    }

    if (pathSegments[0] === 'public' && pathSegments[1]) {
      return `/truck/${decodeURIComponent(pathSegments[1])}`;
    }

    if (pathSegments[0] === 'truck' && pathSegments[1]) {
      return `/truck/${decodeURIComponent(pathSegments[1])}`;
    }
  } catch {
    // Ignore parse errors and fall back to manual parsing below.
  }

  const normalized = url.replace(/^[a-z]+:\/*/i, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);

  if (segments[0] === 'truck' && segments[1]) {
    return `/truck/${decodeURIComponent(segments[1])}`;
  }

  if (segments[0] === 'public' && segments[1]) {
    return `/truck/${decodeURIComponent(segments[1])}`;
  }

  return null;
}
