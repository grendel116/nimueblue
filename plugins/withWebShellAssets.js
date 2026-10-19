const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withWebShellAssets(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const srcDir = path.resolve(config.modRequest.projectRoot, "assets/web");
      const destDir = path.resolve(
        config.modRequest.platformProjectRoot,
        "app/src/main/assets/web"
      );
      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(srcDir, destDir, { recursive: true });
        console.log("withWebShellAssets: Copied assets/web to", destDir);
      } else {
        console.warn("withWebShellAssets: assets/web not found at", srcDir);
      }
      return config;
    },
  ]);
}

module.exports = withWebShellAssets;
