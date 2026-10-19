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
  if (!html.includes('<base href="./">')) {
    html = html.replace("<head>", '<head>\n    <base href="./">\n    <script>if (window.location.protocol === "file:" && window.location.pathname.includes("android_asset")) { try { window.history.replaceState(null, "", "index.html"); } catch (e) {} }</script>');
  }
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Converted asset paths and added base href in index.html");
}

// Convert asset URLs in the bundled JavaScript so icons, fonts, and images load via ./assets/
const jsDir = path.join(assetsWebDir, "_expo/static/js/web");
if (fs.existsSync(jsDir)) {
  const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));
  for (const jsFile of jsFiles) {
    const fullPath = path.join(jsDir, jsFile);
    let js = fs.readFileSync(fullPath, "utf8");
    const beforeCount = (js.match(/\/assets\//g) || []).length;
    js = js.replace(/"\/assets\//g, '"./assets/')
           .replace(/'\/assets\//g, "'./assets/")
           .replace(/\\"\/assets\//g, '\\"./assets/');
    fs.writeFileSync(fullPath, js, "utf8");
    console.log(`Converted asset paths to relative (./assets/) in ${jsFile} (${beforeCount} occurrences found)`);
  }
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

