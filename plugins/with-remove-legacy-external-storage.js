const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const BLOCKED_MEDIA_PERMISSIONS = new Set([
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.ACCESS_MEDIA_LOCATION',
]);

function removeBlockedPermissions(manifest, key) {
  const permissions = manifest[key];
  if (!Array.isArray(permissions)) {
    return;
  }

  manifest[key] = permissions.filter((permission) => {
    const name = permission?.$?.['android:name'];
    return !BLOCKED_MEDIA_PERMISSIONS.has(name);
  });

  if (manifest[key].length === 0) {
    delete manifest[key];
  }
}

module.exports = function withRemoveLegacyExternalStorage(config) {
  return withAndroidManifest(config, (config) => {
    removeBlockedPermissions(config.modResults.manifest, 'uses-permission');
    removeBlockedPermissions(config.modResults.manifest, 'uses-permission-sdk-23');

    const application = AndroidConfig.Manifest.getMainApplication(config.modResults);

    if (application?.$) {
      delete application.$['android:requestLegacyExternalStorage'];
    }

    return config;
  });
};
