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
  // Disable user zooming / scaling
  html = html.replace(
    /<meta name="viewport"[^>]*>/i,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no">'
  );
  if (!html.includes('<base href="./">')) {
    html = html.replace(
      "<head>",
      '<head>\n    <base href="./">\n    <script>if (window.location.protocol === "file:" && window.location.pathname.includes("android_asset")) { try { window.history.replaceState(null, "", "index.html"); } catch (e) {} }</script>'
    );
  }
  // Inject global CSS to completely disable horizontal page movement and hide scrollbars
  const shellCss = `
    <style id="web-shell-lock">
      html, body {
        overflow-x: hidden !important;
        position: fixed !important;
        width: 100% !important;
        height: 100% !important;
        touch-action: pan-y !important;
        -webkit-overflow-scrolling: touch;
      }
      * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    </style>
  `;
  if (!html.includes('id="web-shell-lock"')) {
    html = html.replace("</head>", `${shellCss}\n</head>`);
  }
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Converted asset paths, locked viewport and injected scrollbar-hiding CSS in index.html");
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

