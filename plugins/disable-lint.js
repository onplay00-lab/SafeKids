const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function disableLintPlugin(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("lintOptions")) return config;
    config.modResults.contents = config.modResults.contents.replace(
      "android {",
      `android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }`
    );
    return config;
  });
};
