const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withRemoveLegacyExternalStorage(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplication(config.modResults);

    if (application?.$) {
      delete application.$['android:requestLegacyExternalStorage'];
    }

    return config;
  });
};
