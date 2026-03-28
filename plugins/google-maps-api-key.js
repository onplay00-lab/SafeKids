const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withGoogleMapsApiKey(config) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
    return config;
  }

  return withAndroidManifest(config, (config) => {
    const mainApplication =
      config.modResults.manifest.application[0];

    if (!mainApplication["meta-data"]) {
      mainApplication["meta-data"] = [];
    }

    // Remove existing entry if present
    mainApplication["meta-data"] = mainApplication["meta-data"].filter(
      (item) => item.$?.["android:name"] !== "com.google.android.geo.API_KEY"
    );

    // Add Google Maps API key
    mainApplication["meta-data"].push({
      $: {
        "android:name": "com.google.android.geo.API_KEY",
        "android:value": apiKey,
      },
    });

    return config;
  });
};
