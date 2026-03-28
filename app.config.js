import "dotenv/config";
import appJson from "./app.json";

const config = appJson.expo;

export default {
  expo: {
    ...config,
    android: {
      ...config.android,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    plugins: [
      ...(config.plugins || []),
      "./plugins/disable-lint",
      "./plugins/google-maps-api-key",
    ],
  },
};
