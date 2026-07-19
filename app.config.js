const baseConfig = require('./app.base.json').expo;

const PRODUCTION_ANDROID_PACKAGE = 'app.rork.trucktap_food_truck_finder_cqgko70';
const DEVELOPMENT_ANDROID_PACKAGE = `${PRODUCTION_ANDROID_PACKAGE}.dev`;

module.exports = () => {
  const variant = process.env.APP_VARIANT === 'development' ? 'development' : 'production';
  const isDevelopment = variant === 'development';

  return {
    ...baseConfig,
    name: isDevelopment ? 'TruckTap Dev' : baseConfig.name,
    android: {
      ...baseConfig.android,
      package: isDevelopment ? DEVELOPMENT_ANDROID_PACKAGE : PRODUCTION_ANDROID_PACKAGE,
    },
    extra: {
      ...baseConfig.extra,
      appVariant: variant,
    },
  };
};
