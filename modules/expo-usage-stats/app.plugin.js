const { withAndroidManifest } = require('@expo/config-plugins');

const withUsageStats = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure xmlns:tools is declared
    if (!manifest.$) {
      manifest.$ = {};
    }
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Add PACKAGE_USAGE_STATS permission at manifest level (not inside application)
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
          'tools:ignore': 'ProtectedPermissions',
        },
      });
    }

    // Remove any PACKAGE_USAGE_STATS that ended up inside <application>
    const app = manifest.application?.[0];
    if (app && app['uses-permission']) {
      app['uses-permission'] = app['uses-permission'].filter(
        (p) => p.$?.['android:name'] !== usagePermission
      );
      if (app['uses-permission'].length === 0) {
        delete app['uses-permission'];
      }
    }

    return config;
  });
};

module.exports = withUsageStats;
