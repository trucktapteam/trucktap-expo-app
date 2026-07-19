import * as Application from 'expo-application';
import { Platform } from 'react-native';

export type ClientPlatform = 'android' | 'ios' | 'web';

const parseNativeBuild = (value: string | null | undefined): number | null => {
  if (!value || !/^[1-9][0-9]{0,8}$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const getClientRelease = () => {
  const platform: ClientPlatform =
    Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
  const nativeBuild =
    platform === 'web' ? null : parseNativeBuild(Application.nativeBuildVersion);
  const appVersion = Application.nativeApplicationVersion?.trim() || null;

  return { platform, nativeBuild, appVersion };
};

export const getOwnerClientHeaders = (): Record<string, string> => {
  const release = getClientRelease();
  const headers: Record<string, string> = {
    'X-TruckTap-Platform': release.platform,
  };

  if (release.nativeBuild !== null) {
    headers['X-TruckTap-Build'] = String(release.nativeBuild);
  }
  if (release.appVersion) {
    headers['X-TruckTap-App-Version'] = release.appVersion;
  }

  return headers;
};
