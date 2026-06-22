const REPO_TREE_URL =
  "https://api.github.com/repos/Resistine/resistine.github.io/git/trees/main?recursive=1";
const RELEASES_MANIFEST_URL = "releases.json";
const APPCAST_URL = "appcast.xml";
const CHECKSUMS_URL = "checksums.sha256";
const PLATFORM_META = {
  windows: { label: "Windows", note: "Setup installers for Windows desktops." },
  mac: { label: "macOS", note: "DMG installers for Apple desktop systems." },
  ios: { label: "iOS", note: "Coming soon to the App Store." },
  android: { label: "Android", note: "Release candidate APK packages." },
  linux: { label: "Linux", note: "Linux packages appear here when published." }
};

const state = {
  detectedPlatform: "all",
  language: localStorage.getItem("resistine-language") || "en",
  checksums: new Map(),
  loadSource: "Repository",
  latestOnly: false,
  releases: [],
  platform: "all",
  query: "",
  sort: "newest"
};

const els = {
  header: document.querySelector(".site-header"),
  archiveList: document.querySelector("#release-list"),
  detectedCopy: document.querySelector("#detected-copy"),
  detectedPlatform: document.querySelector("#detected-platform"),
  platformGrid: document.querySelector("#platform-grid"),
  primaryDownload: document.querySelector("#primary-download"),
  primaryIcon: document.querySelector("#primary-icon"),
  primaryTitle: document.querySelector("#primary-title"),
  primarySubtitle: document.querySelector("#primary-subtitle"),
  primaryVersion: document.querySelector("#primary-version"),
  primaryArchitecture: document.querySelector("#primary-architecture"),
  primarySize: document.querySelector("#primary-size"),
  primarySource: document.querySelector("#primary-source"),
  primarySecondary: document.querySelector("#primary-secondary"),
  search: document.querySelector("#release-search"),
  latestOnly: document.querySelector("#latest-only"),
  sortMenu: document.querySelector("#sort-menu"),
  sortTrigger: document.querySelector("#sort-trigger"),
  sortTriggerLabel: document.querySelector("#sort-trigger-label"),
  sortOptionsPanel: document.querySelector("#sort-options"),
  sortOptions: [...document.querySelectorAll(".sort-option")],
  languageMenu: document.querySelector("#language-menu"),
  languageTrigger: document.querySelector("#language-trigger"),
  languageTriggerLabel: document.querySelector("#language-trigger-label"),
  languageOptionsPanel: document.querySelector("#language-options"),
  languageOptions: [...document.querySelectorAll(".language-option")],
  themeToggle: document.querySelector("#theme-toggle"),
  tabs: [...document.querySelectorAll(".tab")]
};

function t(key, values = {}) {
  const template = I18N[state.language]?.[key] || I18N.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function applyLanguage(language) {
  state.language = I18N[language] ? language : "en";
  document.documentElement.lang = state.language;
  localStorage.setItem("resistine-language", state.language);
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  if (els.themeToggle) els.themeToggle.setAttribute("aria-label", t("theme.toggle"));
  if (els.languageTrigger) els.languageTrigger.setAttribute("aria-label", t("language.label"));
  if (els.languageOptionsPanel) els.languageOptionsPanel.setAttribute("aria-label", t("language.label"));
  if (els.sortTrigger) els.sortTrigger.setAttribute("aria-label", t("sort.label"));
  if (els.sortOptionsPanel) els.sortOptionsPanel.setAttribute("aria-label", t("sort.label"));
  renderLanguageMenu();
  renderSortMenu();
}

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("resistine-theme", nextTheme);
}

function updateHeaderState() {
  els.header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function scrollToHashTarget(hash = window.location.hash) {
  if (!hash || hash === "#") return;
  const target = document.querySelector(hash);
  if (!target) return;
  const anchor = target.querySelector?.(".section-title") || target;
  const headerHeight = els.header?.getBoundingClientRect().height || 0;
  const safeGap = 18;
  window.requestAnimationFrame(() => {
    const top = anchor.getBoundingClientRect().top + window.scrollY - headerHeight - safeGap;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });
}

function sortLabel(value) {
  return t(`sort.${value}`);
}

function languageLabel(value) {
  return value.toUpperCase();
}

function closeLanguageMenu() {
  if (!els.languageMenu || !els.languageTrigger || !els.languageOptionsPanel) return;
  els.languageMenu.classList.remove("is-open");
  els.languageTrigger.setAttribute("aria-expanded", "false");
  els.languageOptionsPanel.hidden = true;
}

function openLanguageMenu() {
  if (!els.languageMenu || !els.languageTrigger || !els.languageOptionsPanel) return;
  closeSortMenu();
  els.languageMenu.classList.add("is-open");
  els.languageTrigger.setAttribute("aria-expanded", "true");
  els.languageOptionsPanel.hidden = false;
}

function closeSortMenu() {
  if (!els.sortMenu || !els.sortTrigger || !els.sortOptionsPanel) return;
  els.sortMenu.classList.remove("is-open");
  els.sortTrigger.setAttribute("aria-expanded", "false");
  els.sortOptionsPanel.hidden = true;
}

function openSortMenu() {
  if (!els.sortMenu || !els.sortTrigger || !els.sortOptionsPanel) return;
  closeLanguageMenu();
  els.sortMenu.classList.add("is-open");
  els.sortTrigger.setAttribute("aria-expanded", "true");
  els.sortOptionsPanel.hidden = false;
}

function renderLanguageMenu() {
  if (els.languageTriggerLabel) {
    els.languageTriggerLabel.textContent = languageLabel(state.language);
  }
  if (!els.languageOptions.length) return;
  els.languageOptions.forEach((option) => {
    const selected = option.dataset.languageValue === state.language;
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = selected ? 0 : -1;
  });
}

function renderSortMenu() {
  if (els.sortTriggerLabel) {
    els.sortTriggerLabel.textContent = sortLabel(state.sort);
  }
  if (!els.sortOptions.length) return;
  els.sortOptions.forEach((option) => {
    const selected = option.dataset.sortValue === state.sort;
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = selected ? 0 : -1;
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function getPlatform(path) {
  const match = path.match(/^releases\/([^/]+)\//);
  return match ? match[1] : "other";
}

function isReleaseFile(path) {
  return /\.(?:exe|msi|dmg|pkg|apk|ipa|appimage|deb|rpm|zip|tgz|tar\.gz)$/i.test(path);
}

function platformLabel(platform) {
  return PLATFORM_META[platform]?.label || "Other";
}

function platformIcon(platform) {
  return {
    android: "Android",
    ios: "iOS",
    linux: "Linux",
    mac: "macOS",
    windows: "Windows"
  }[platform] || "Release";
}

function platformIconSvg(platform) {
  const icons = {
    android: `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M7.2 8.4 5.7 6.1a.75.75 0 1 1 1.3-.75L8.7 8a8 8 0 0 1 6.6 0L17 5.35a.75.75 0 1 1 1.3.75l-1.5 2.3A6.8 6.8 0 0 1 19 13.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5.5a6.8 6.8 0 0 1 2.2-5.1Zm.8 5.1V18h8v-4.5a4 4 0 0 0-8 0Zm1.2-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Zm5.6 0a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8ZM3 13h1v5H3v-5Zm17 0h1v5h-1v-5Z" />
      </svg>`,
    ios: `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
        <rect x="7" y="2.75" width="10" height="18.5" rx="2.5" stroke="currentColor" stroke-width="2" />
        <path d="M10.5 6h3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        <circle cx="12" cy="17.5" r="1" fill="currentColor" />
      </svg>`,
    linux: `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" />
        <path d="m7 9 3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M12.5 15H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>`,
    mac: `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M16.3 2.4c.1 1.2-.4 2.3-1.2 3.2-.8.9-2 1.5-3.1 1.4-.1-1.1.4-2.2 1.2-3.1.8-.9 2-1.5 3.1-1.5ZM20 16.8c-.4 1-1 1.9-1.7 2.8-.9 1.2-1.8 2.3-3.1 2.3-.7 0-1.2-.2-1.8-.5-.6-.3-1.2-.5-2-.5s-1.5.3-2.1.5c-.6.3-1.1.5-1.8.5-1.2 0-2.2-1.1-3.1-2.4C2.7 17 1.8 12.7 3.9 10c1-1.3 2.5-2.1 4.1-2.1.7 0 1.4.3 2 .5.5.2 1 .4 1.5.4s1-.2 1.6-.4c.7-.3 1.5-.6 2.4-.5 1.4.1 2.7.7 3.6 1.8-1.6 1-2.4 2.4-2.4 4.1 0 1.8 1.1 3 3.3 3Z" />
      </svg>`,
    windows: `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M3 5.3 11 4v7.4H3V5.3Zm9-1.5 9-1.4v9h-9V3.8ZM3 12.6h8V20l-8-1.3v-6.1Zm9 0h9v9l-9-1.4v-7.6Z" />
      </svg>`
  };
  return icons[platform] || `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M5 3h10l4 4v14H5V3Zm9 1.8V8h3.2L14 4.8ZM7 5v14h10V10h-5V5H7Z" />
    </svg>`;
}

function basename(path) {
  return path.split("/").pop();
}

function fileType(path) {
  const extension = path.split(".").pop().toLowerCase();
  return {
    apk: "APK",
    dmg: "DMG",
    exe: "EXE",
    gz: "Archive",
    pkg: "PKG",
    tar: "Archive",
    zip: "ZIP"
  }[extension] || extension.toUpperCase();
}

function architecture(path) {
  const file = basename(path).toLowerCase();
  if (/arm64|aarch64/.test(file)) return "ARM64";
  if (/x64|x86_64|amd64/.test(file)) return "x64";
  if (/win/.test(file)) return "Windows";
  if (/mac/.test(file)) return "macOS";
  if (/android|apk/.test(file)) return "Android APK";
  if (/linux/.test(file)) return "Linux";
  return "Universal";
}

function releaseType(release) {
  return `${fileType(release.path)} · ${architecture(release.path)}`;
}

function descriptionNotes(description) {
  if (!description) return [];
  const doc = new DOMParser().parseFromString(description, "text/html");
  const listItems = [...doc.querySelectorAll("li")]
    .map((item) => item.textContent.trim())
    .filter(Boolean);
  if (listItems.length) return listItems;
  const text = doc.body.textContent.trim();
  return text ? [text] : [];
}

function parseVersion(path) {
  const file = basename(path).replace(/\.[^.]+$/, "");
  const date = file.match(/20\d{2}[._-]\d{2}[._-]\d{2}(?:[-._][a-zA-Z0-9]+)*/);
  if (date) return date[0].replace(/^(\d{4})[-._](\d{2})[-._](\d{2})/, "$1.$2.$3");
  const semver = file.match(/\d+\.\d+\.\d+(?:[-._][a-zA-Z0-9]+)*/);
  return semver ? semver[0] : "Unknown";
}

function dateFromVersion(version) {
  const match = version.match(/^(20\d{2})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function scoreRelease(release) {
  const releasedAt = release.date?.getTime();
  if (Number.isFinite(releasedAt)) return releasedAt;
  const semver = release.version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!semver) return 0;
  return Number(semver[1]) * 1000000 + Number(semver[2]) * 1000 + Number(semver[3]);
}

function compareNewestRelease(a, b) {
  const score = scoreRelease(b) - scoreRelease(a);
  if (score !== 0) return score;
  const version = b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: "base" });
  if (version !== 0) return version;
  return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" });
}

function detectPlatform() {
  const userAgent = navigator.userAgent || "";
  const platform = navigator.userAgentData?.platform || navigator.platform || userAgent;
  const source = `${platform} ${userAgent}`;
  const touchMac = /mac/i.test(platform) && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(source) || touchMac) return "ios";
  if (/android/i.test(source)) return "android";
  if (/win/i.test(source)) return "windows";
  if (/mac/i.test(source)) return "mac";
  if (/linux/i.test(source)) return "linux";
  return "all";
}

function getSparkleAttribute(enclosure, localName) {
  return (
    enclosure.getAttribute(`sparkle:${localName}`) ||
    enclosure.getAttributeNS("http://www.andymatuschak.org/xml-namespaces/sparkle", localName) ||
    ""
  );
}

function releaseFromFile(file, appcastByPath) {
  const path = file.path;
  const platform = getPlatform(path);
  const appcast = appcastByPath.get(path) || {};
  const version = file.version || appcast.version || parseVersion(path);
  const pushedDate = file.date || file.published_at || file.uploaded_at || file.updated_at || file.created_at;
  const parsedManifestDate = pushedDate ? new Date(pushedDate) : null;
  const manifestDate = parsedManifestDate && !Number.isNaN(parsedManifestDate.getTime())
    ? parsedManifestDate
    : null;
  const date = manifestDate || appcast.date || dateFromVersion(version);
  return {
    path,
    name: basename(path),
    href: file.href || path,
    platform,
    version,
    size: Number(file.size || appcast.size || 0),
    date,
    notes: appcast.notes?.length ? appcast.notes : Array.isArray(file.notes) ? file.notes : [],
    signature: appcast.signature || file.signature || "",
    checksum: file.checksum || state.checksums?.get(path) || "",
    source: file.source || appcast.source || state.loadSource
  };
}

async function loadChecksums() {
  try {
    const response = await fetch(CHECKSUMS_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error("Checksum request failed");
    const text = await response.text();
    const map = new Map();
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
      if (match) map.set(match[2].trim(), match[1].toLowerCase());
    }
    return map;
  } catch (error) {
    return new Map();
  }
}

async function loadAppcast() {
  try {
    const response = await fetch(APPCAST_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error("Appcast request failed");
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const items = [...doc.querySelectorAll("item")];
    const map = new Map();

    for (const item of items) {
      const enclosure = item.querySelector("enclosure");
      if (!enclosure) continue;
      const url = enclosure.getAttribute("url") || "";
      const path = new URL(url, window.location.href).pathname.replace(/^\/+/, "");
      const version =
        getSparkleAttribute(enclosure, "version") ||
        item.querySelector("title")?.textContent?.replace(/^Version\s+/i, "") ||
        "";
      const pubDate = item.querySelector("pubDate")?.textContent || "";
      const size = Number(enclosure.getAttribute("length") || 0);
      const date = pubDate ? new Date(pubDate) : null;
      const description = item.querySelector("description")?.textContent || "";
      map.set(path, {
        version,
        size,
        date,
        notes: descriptionNotes(description),
        signature: getSparkleAttribute(enclosure, "edSignature"),
        source: "Appcast"
      });
    }

    return map;
  } catch (error) {
    return new Map();
  }
}

async function loadReleaseManifest() {
  const response = await fetch(RELEASES_MANIFEST_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error("Release manifest request failed");
  const data = await response.json();
  const remote = Array.isArray(data.releases) ? data.releases : [];
  const local = Array.isArray(data.fallbackReleases) ? data.fallbackReleases : [];
  const candidates = remote.length ? remote : local;
  const files = candidates
    .filter((entry) => entry && typeof entry.path === "string")
    .filter((entry) => /^releases\/(android|ios|linux|mac|windows)\//.test(entry.path))
    .filter((entry) => isReleaseFile(entry.path));
  if (!files.length) throw new Error("No usable files in release manifest");
  state.loadSource = remote.length ? "GitHub Releases" : "Local manifest";
  return files;
}

async function loadReleaseFiles() {
  try {
    return await loadReleaseManifest();
  } catch (manifestError) {
    // Continue to repository discovery when the generated manifest is unavailable.
  }

  try {
    const response = await fetch(REPO_TREE_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error("GitHub tree request failed");
    const data = await response.json();
    const files = (data.tree || [])
      .filter((entry) => entry.type === "blob")
      .filter((entry) => /^releases\/(android|ios|linux|mac|windows)\//.test(entry.path))
      .filter((entry) => isReleaseFile(entry.path))
      .map((entry) => ({ path: entry.path, size: entry.size }));

    if (!files.length) throw new Error("No release files in tree");
    state.loadSource = "GitHub tree";
    return files;
  } catch (error) {
    state.loadSource = "Embedded fallback";
    return RELEASE_FALLBACK;
  }
}

function latestByPlatform(platform) {
  return state.releases
    .filter((release) => release.platform === platform)
    .sort(compareNewestRelease)[0];
}

function updatePrimaryDownload() {
  const detected = state.detectedPlatform;
  const fallbackPlatform = ["windows", "mac", "android", "linux"].find((platform) =>
    latestByPlatform(platform)
  );
  const platform = detected !== "all" && latestByPlatform(detected) ? detected : fallbackPlatform;
  const release = platform ? latestByPlatform(platform) : null;
  const meta = PLATFORM_META[platform] || {};

  els.detectedPlatform.textContent =
    detected === "all"
      ? "OS not detected"
      : detected === "ios"
        ? t("primary.mobileDetected")
        : `${platformLabel(detected)} detected`;
  els.detectedCopy.innerHTML = release
    ? detected !== "all" && detected !== platform
      ? `${t("primary.noDetected", { detected: platformLabel(detected), platform: platformLabel(platform) })} <a href="#downloads">${t("primary.chooseAnother")}</a>`
      : `${t("primary.bestMatch", { platform: platformLabel(platform) })} <a href="#downloads">${t("primary.notYourOs")}</a>`
    : `${t("primary.noMatch")} <a href="#archive">${t("primary.checkArchive")}</a>`;

  if (!release) return;

  els.primaryDownload.href = release.href;
  els.primaryIcon.innerHTML = platformIconSvg(platform);
  els.primaryTitle.textContent = `Download for ${meta.label}`;
  els.primarySubtitle.textContent = release.name;
  els.primaryVersion.textContent = release.version;
  els.primaryArchitecture.textContent = releaseType(release);
  els.primarySize.textContent = formatBytes(release.size);
  els.primarySource.textContent = release.source;
  els.primarySecondary.href = "#archive";
}

function renderPlatformCards() {
  const platforms = ["windows", "mac", "android", "linux"];
  els.platformGrid.innerHTML = platforms
    .map((platform) => {
      const meta = PLATFORM_META[platform];
      const latest = latestByPlatform(platform);
      const selected = platform === state.detectedPlatform;
      const href = latest?.href || "#archive";
      const title = latest ? latest.version : "No file yet";
      const detail = latest
        ? `${releaseType(latest)} · ${formatBytes(latest.size)} · ${formatDate(latest.date)}`
        : platform === "ios"
          ? t("platform.iosMissing")
          : platform === "linux"
            ? t("platform.linuxMissing")
          : t("platform.publishHint");
      const button = latest ? t("actions.downloadLatest") : t("actions.viewArchive");

      return `
        <article class="platform-card${selected ? " selected" : ""}">
          <div class="platform-top">
            <span class="platform-icon" aria-hidden="true">${platformIconSvg(platform)}</span>
            ${selected ? '<span class="tag">Detected</span>' : ""}
          </div>
          <div>
            <h3>${escapeHtml(meta.label)}</h3>
            <p>${escapeHtml(meta.note)}</p>
          </div>
          <div class="platform-latest">
            ${t("platform.latest")}
            <strong>${escapeHtml(title)}</strong>
            ${escapeHtml(detail)}
          </div>
          ${
            latest
              ? `<a class="button${selected ? " blue" : ""}" href="${escapeHtml(href)}">${button}</a>`
              : `<div class="empty-platform"><span>${t("platform.noInstaller", { platform: meta.label })}</span><a class="button" href="#archive">${button}</a></div>`
          }
        </article>
      `;
    })
    .join("");
}

function filteredReleases() {
  const query = state.query.trim().toLowerCase();
  return state.releases.filter((release) => {
    const matchesPlatform = state.platform === "all" || release.platform === state.platform;
    const latestMatch = !state.latestOnly || latestByPlatform(release.platform)?.path === release.path;
    const haystack = `${release.name} ${release.version} ${release.platform} ${releaseType(release)}`.toLowerCase();
    return matchesPlatform && latestMatch && (!query || haystack.includes(query));
  });
}

function sortedReleases(releases) {
  return [...releases].sort((a, b) => {
    if (state.sort === "platform") {
      const platform = platformLabel(a.platform).localeCompare(platformLabel(b.platform));
      if (platform !== 0) return platform;
      return compareNewestRelease(a, b);
    }
    if (state.sort === "size") {
      return b.size - a.size || compareNewestRelease(a, b);
    }
    if (state.sort === "name") {
      return a.name.localeCompare(b.name);
    }
    return compareNewestRelease(a, b);
  });
}

function signatureVerifyCommand(release) {
  if (release.platform === "windows") {
    return t("details.signatureVerifyWindows", { file: release.name });
  }
  if (release.platform === "mac") {
    return t("details.signatureVerifyMac", { file: release.name });
  }
  if (release.platform === "android") {
    return t("details.signatureVerifyAndroid", { file: release.name });
  }
  return t("details.signatureVerifyDetached", { file: release.name });
}

function releaseDetails(release) {
  const notes = release.notes.length
    ? `<div><strong>${t("details.releaseNotes")}</strong><ul class="notes-list">${release.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul></div>`
    : `<div><strong>${t("details.releaseNotes")}</strong><p>${t("details.noNotes")}</p></div>`;
  const signatureVerify = `
    <div class="verify-help">
      <strong>${t("details.signatureVerifyTitle")}</strong>
      <p>${t("details.signatureVerifyCopy")}</p>
      <code>${escapeHtml(signatureVerifyCommand(release))}</code>
    </div>`;
  const signature = release.signature
    ? `<div><strong>${t("details.signature")}</strong><div class="signature-row"><code>${escapeHtml(release.signature)}</code><button class="copy-small" type="button" data-copy="${escapeHtml(release.signature)}">${t("actions.copy")}</button></div>${signatureVerify}</div>`
    : `<div><strong>${t("details.signature")}</strong><p>${t("details.noSignature")}</p>${signatureVerify}</div>`;
  const checksum = release.checksum
    ? `<div><strong>${t("details.sha256")}</strong><div class="signature-row"><code>${escapeHtml(release.checksum)}</code><button class="copy-small" type="button" data-copy="${escapeHtml(release.checksum)}">${t("actions.copy")}</button></div></div>`
    : `<div><strong>${t("details.sha256")}</strong><p>${t("details.noSha256")}</p></div>`;
  const verifyCommand = release.platform === "mac"
    ? t("details.verifyMacCommand", { file: release.name })
    : t("details.verifyCommand", { file: release.name });

  return `
    <details class="details">
      <summary>${t("details.summary")}</summary>
      <div class="details-body">
        ${notes}
        ${signature}
        ${checksum}
        <div class="verify-help">
          <strong>${t("details.verifyTitle")}</strong>
          <p>${t("details.verifyCopy")}</p>
          <code>${escapeHtml(verifyCommand)}</code>
        </div>
      </div>
    </details>
  `;
}

function renderArchive() {
  const releases = sortedReleases(filteredReleases());

  if (!releases.length) {
    const message =
      state.platform === "ios"
        ? t("platform.iosMissing")
        : state.platform === "linux"
          ? t("platform.linuxMissing")
        : t("archive.noMatch");
    els.archiveList.innerHTML = `<li class="empty">${message}</li>`;
    return;
  }

  els.archiveList.innerHTML = releases
    .map((release) => {
      const latestForPlatform = latestByPlatform(release.platform)?.path === release.path;
      return `
        <li class="release-row">
          <div class="file-cell">
            <span class="file-icon" aria-hidden="true">${platformIconSvg(release.platform)}</span>
            <div>
              <div class="file-name">${escapeHtml(release.name)}</div>
              <div class="file-path">${escapeHtml(release.path)}</div>
              <div class="release-chips">
                <span class="tag">${escapeHtml(releaseType(release))}</span>
                <span class="tag">${escapeHtml(release.source)}</span>
              </div>
            </div>
          </div>
          <div>${escapeHtml(release.version)}${latestForPlatform ? ' <span class="tag">Latest</span>' : ""}</div>
          <div class="cell-muted">${formatBytes(release.size)}</div>
          <div>${platformLabel(release.platform)}</div>
          <div class="cell-muted">${formatDate(release.date)}</div>
          <a class="download" href="${escapeHtml(release.href)}" download>${t("actions.download")}<span class="sr-only"> ${escapeHtml(release.name)}</span></a>
          ${releaseDetails(release)}
        </li>
      `;
    })
    .join("");
}

function bindControls() {
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderArchive();
  });

  els.latestOnly.addEventListener("click", () => {
    state.latestOnly = !state.latestOnly;
    els.latestOnly.setAttribute("aria-pressed", String(state.latestOnly));
    renderArchive();
  });

  els.themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme;
    setTheme(currentTheme === "dark" ? "light" : "dark");
  });

  window.addEventListener("scroll", updateHeaderState, { passive: true });
  window.addEventListener("hashchange", scrollToHashTarget);

  els.languageTrigger?.addEventListener("click", () => {
    if (els.languageMenu?.classList.contains("is-open")) {
      closeLanguageMenu();
      return;
    }
    openLanguageMenu();
  });

  els.languageTrigger?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openLanguageMenu();
      els.languageOptions.find((option) => option.dataset.languageValue === state.language)?.focus();
    }
  });

  els.languageOptions.forEach((option, index) => {
    option.addEventListener("click", () => {
      applyLanguage(option.dataset.languageValue);
      updatePrimaryDownload();
      renderPlatformCards();
      renderArchive();
      closeLanguageMenu();
      els.languageTrigger?.focus();
    });

    option.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        els.languageOptions[(index + 1) % els.languageOptions.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        els.languageOptions[(index - 1 + els.languageOptions.length) % els.languageOptions.length].focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeLanguageMenu();
        els.languageTrigger?.focus();
      }
    });
  });

  els.sortTrigger?.addEventListener("click", () => {
    if (els.sortMenu?.classList.contains("is-open")) {
      closeSortMenu();
      return;
    }
    openSortMenu();
  });

  els.sortTrigger?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openSortMenu();
      els.sortOptions.find((option) => option.dataset.sortValue === state.sort)?.focus();
    }
  });

  els.sortOptions.forEach((option, index) => {
    option.addEventListener("click", () => {
      state.sort = option.dataset.sortValue;
      renderSortMenu();
      renderArchive();
      closeSortMenu();
      els.sortTrigger?.focus();
    });

    option.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        els.sortOptions[(index + 1) % els.sortOptions.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        els.sortOptions[(index - 1 + els.sortOptions.length) % els.sortOptions.length].focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSortMenu();
        els.sortTrigger?.focus();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!els.languageMenu?.contains(event.target)) closeLanguageMenu();
    if (!els.sortMenu?.contains(event.target)) closeSortMenu();
    const anchor = event.target.closest?.('a[href^="#"]');
    if (!anchor) return;
    const hash = anchor.getAttribute("href");
    if (!hash || hash === "#") return;
    if (!document.querySelector(hash)) return;
    event.preventDefault();
    if (window.location.hash !== hash) {
      history.pushState(null, "", hash);
    }
    scrollToHashTarget(hash);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLanguageMenu();
      closeSortMenu();
    }
  });

  for (const tab of els.tabs) {
    tab.addEventListener("click", () => {
      state.platform = tab.dataset.platform;
      els.tabs.forEach((item) =>
        item.setAttribute("aria-selected", String(item === tab))
      );
      renderArchive();
    });
  }

  els.archiveList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    const value = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = t("actions.copied");
      setTimeout(() => {
        button.textContent = t("actions.copy");
      }, 1400);
    } catch (error) {
      window.prompt("Copy signature", value);
    }
  });
}

async function init() {
  applyLanguage(state.language);
  updateHeaderState();
  bindControls();
  state.detectedPlatform = detectPlatform();

  const [files, appcastByPath, checksums] = await Promise.all([
    loadReleaseFiles(),
    loadAppcast(),
    loadChecksums()
  ]);
  state.checksums = checksums;
  state.releases = files
    .map((file) => releaseFromFile(file, appcastByPath))
    .filter((release) => release.platform !== "other");

  updatePrimaryDownload();
  renderPlatformCards();
  renderSortMenu();
  renderArchive();
  scrollToHashTarget();
}

init();
