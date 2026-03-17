const { withAndroidManifest } = require('@expo/config-plugins');

const withUsageStats = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = manifest.manifest.application?.[0];

    if (!mainApplication) return config;

    if (!mainApplication['uses-permission']) {
      mainApplication['uses-permission'] = [];
    }

    const permissions = mainApplication['uses-permission'];
    const usagePermission = 'android.permission.PACKAGE_USAGE_STATS';

    const alreadyAdded = permissions.some(
      (p) => p.$?.['android:name'] === usagePermission
    );

    if (!alreadyAdded) {
      permissions.push({
        $: { 'android:name': usagePermission },
      });
    }

    return config;
  });
};

module.exports = withUsageStats;
