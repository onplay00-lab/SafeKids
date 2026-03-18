const { withAndroidManifest } = require('@expo/config-plugins');

const withUsageStats = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = manifest['uses-permission'];
    const usagePermission = 'android.permission.PACKAGE_USAGE_STATS';

    const alreadyAdded = permissions.some(
      (p) => p.$?.['android:name'] === usagePermission
    );

    if (!alreadyAdded) {
      permissions.push({
        $: {
          'android:name': usagePermission,
          'xmlns:tools': 'http://schemas.android.com/tools',
          'tools:ignore': 'ProtectedPermissions',
        },
      });
    }

    return config;
  });
};

module.exports = withUsageStats;
