/**
 * content/blog の Markdown 変更を監視し、ブログページを touch して Next.js の再コンパイルを促す。
 * npm run dev と同時に実行することで、記事編集後に自動反映されるようにする。
 */
const fs = require("fs");
const path = require("path");

const contentDir = path.join(process.cwd(), "content", "blog");
const triggerFiles = [
  path.join(process.cwd(), "app", "[locale]", "blog", "[slug]", "page.tsx"),
  path.join(process.cwd(), "app", "[locale]", "blog", "page.tsx"),
];

let timeout = null;
const DEBOUNCE_MS = 300;

function touch(filePath) {
  const now = new Date();
  try {
    fs.utimesSync(filePath, now, now);
    console.log("[watch-content] Triggered reload:", path.relative(process.cwd(), filePath));
  } catch (err) {
    console.error("[watch-content] Touch failed:", err.message);
  }
}

function onChange(eventType, filename) {
  if (!filename || !filename.endsWith(".md")) return;
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    triggerFiles.forEach((f) => {
      if (fs.existsSync(f)) touch(f);
    });
  }, DEBOUNCE_MS);
}

if (!fs.existsSync(contentDir)) {
  console.warn("[watch-content] content/blog not found, exiting");
  process.exit(0);
}

const missing = triggerFiles.filter((f) => !fs.existsSync(f));
if (missing.length === triggerFiles.length) {
  console.warn("[watch-content] Blog pages not found");
  process.exit(1);
}

console.log("[watch-content] Watching", contentDir);

try {
  fs.watch(
    contentDir,
    { recursive: true },
    (eventType, filename) => onChange(eventType, filename)
  );
} catch (err) {
  console.error("[watch-content] Watch failed:", err.message);
  process.exit(1);
}
