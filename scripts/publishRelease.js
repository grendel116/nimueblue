const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function main() {
  const credOutput = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n",
    encoding: "utf8",
  });
  const token = credOutput
    .split("\n")
    .find((l) => l.startsWith("password="))
    ?.replace("password=", "")
    .trim();

  if (!token) {
    throw new Error("Could not retrieve GitHub token from git credentials.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "NimueBlue",
  };

  const pkg = require("../package.json");
  const version = pkg.version;
  const tagName = `v${version}`;
  const releaseName = `v${version}`;
  const apkFileName = `NimueBlue.${version}.apk`;
  const releaseBody = `### What's Changed in NimueBlue ${version}

* **Album-Focused Search & Genre Browsing**: Removed the standalone track view from search results and genre/tag pages so browsing feels like exploring a record store, surfacing parent albums across Mirlo, Chorus, Faircamp, and local downloads.
* **Random Album Playback on Genres & Tags**: Updated the genre/tag header action to **Play** (with the shuffle icon) to pick a random release and play its tracks in album order.
* **Web App & Native Shell Updated**: Rebuilt the Android native web shell bundle, GitHub Pages web app, and Cloudflare Worker for v${version}.

**Download:** [${apkFileName}](https://github.com/grendel116/nimueblue/releases/download/${tagName}/${apkFileName})`;

  console.log("Checking if release already exists for", tagName);
  let releaseRes = await fetch(
    `https://api.github.com/repos/grendel116/nimueblue/releases/tags/${tagName}`,
    { headers }
  );

  let releaseData;
  if (releaseRes.ok) {
    releaseData = await releaseRes.json();
    console.log("Found existing release ID:", releaseData.id);
    await fetch(
      `https://api.github.com/repos/grendel116/nimueblue/releases/${releaseData.id}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: releaseName,
          body: releaseBody,
        }),
      }
    );
    console.log("Updated release details.");
  } else {
    console.log("Creating new GitHub release for", tagName);
    const createRes = await fetch(
      "https://api.github.com/repos/grendel116/nimueblue/releases",
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag_name: tagName,
          name: releaseName,
          body: releaseBody,
          draft: false,
          prerelease: false,
        }),
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create release: ${createRes.status} ${errText}`);
    }

    releaseData = await createRes.json();
    console.log("Created release ID:", releaseData.id);
  }

  const apkPath = path.resolve(__dirname, `../${apkFileName}`);
  if (!fs.existsSync(apkPath)) {
    throw new Error(`APK file not found at ${apkPath}`);
  }

  const apkStats = fs.statSync(apkPath);
  console.log(`Uploading ${apkPath} (${(apkStats.size / 1024 / 1024).toFixed(1)} MB)...`);

  const existingAsset = (releaseData.assets || []).find(
    (a) => a.name === apkFileName
  );
  if (existingAsset) {
    console.log("Deleting existing asset ID:", existingAsset.id);
    await fetch(existingAsset.url, {
      method: "DELETE",
      headers,
    });
  }

  const uploadUrl = releaseData.upload_url.replace(
    /\{(\?.*)?\}/,
    `?name=${apkFileName}`
  );

  const apkBuffer = fs.readFileSync(apkPath);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "NimueBlue",
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(apkStats.size),
    },
    body: apkBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload APK asset: ${uploadRes.status} ${errText}`);
  }

  const uploadedAsset = await uploadRes.json();
  console.log("Successfully uploaded APK asset!");
  console.log("Asset download URL:", uploadedAsset.browser_download_url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
