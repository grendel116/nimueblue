// Builds the web app specifically for the native Android APK shell.
// Relative base path ensures all bundles, fonts, and assets load from file:///android_asset/web/
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const outputDir = path.resolve(__dirname, "../android/app/src/main/assets/web");

console.log("Exporting web bundle for Android APK shell into:", outputDir);

execSync(`npx expo export -p web --clear --output-dir "${outputDir}"`, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_WEB_SHELL: "1" },
});

// WebView loading file:///android_asset/web/index.html requires relative paths (./)
const htmlPath = path.join(outputDir, "index.html");
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace(/src="\//g, 'src="./').replace(/href="\//g, 'href="./');
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Converted asset paths to relative (./) in index.html");
}

console.log("Local web shell assets compiled successfully.");
