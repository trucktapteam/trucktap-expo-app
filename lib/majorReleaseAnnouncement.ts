import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_RELEASE_PREFIX = 'trucktap:major-release:dismissed:';

export const getMajorReleaseDismissalKey = (releaseId: string) =>
  `${DISMISSED_RELEASE_PREFIX}${releaseId}`;

export const hasDismissedMajorRelease = async (releaseId: string) =>
  (await AsyncStorage.getItem(getMajorReleaseDismissalKey(releaseId))) !== null;

export const dismissMajorRelease = async (releaseId: string) => {
  await AsyncStorage.setItem(
    getMajorReleaseDismissalKey(releaseId),
    new Date().toISOString(),
  );
};
