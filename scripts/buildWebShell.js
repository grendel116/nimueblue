// Builds the web app specifically for the native Android APK shell.
// Relative base path ensures all bundles, fonts, and assets load from file:///android_asset/web/
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const assetsWebDir = path.resolve(__dirname, "../assets/web");
const androidAssetsDir = path.resolve(__dirname, "../android/app/src/main/assets/web");

console.log("Exporting web bundle for Android APK shell into:", assetsWebDir);

execSync(`npx expo export -p web --clear --output-dir "${assetsWebDir}"`, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_WEB_SHELL: "1" },
});

// WebView loading file:///android_asset/web/index.html requires relative paths (./)
const htmlPath = path.join(assetsWebDir, "index.html");
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace(/src="\//g, 'src="./').replace(/href="\//g, 'href="./');
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Converted asset paths to relative (./) in index.html");
}

// Sync to local android project if present
try {
  fs.mkdirSync(androidAssetsDir, { recursive: true });
  fs.cpSync(assetsWebDir, androidAssetsDir, { recursive: true });
  console.log("Synced assets/web to", androidAssetsDir);
} catch (err) {
  console.warn("Could not copy directly to android/assets (will be done during prebuild):", err);
}

console.log("Local web shell assets compiled successfully.");

