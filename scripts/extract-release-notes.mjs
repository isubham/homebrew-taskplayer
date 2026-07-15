import { readFileSync } from "node:fs";

const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const version = process.argv[2] ?? packageJson.version;
const lines = changelog.split(/\r?\n/);
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const versionHeading = new RegExp(`^## \\[?${escapedVersion}\\]?(?:\\s+-|$)`);

const start = lines.findIndex((line) => versionHeading.test(line));
if (start === -1) {
  console.error(
    `CHANGELOG.md has no section for ${version}. Move Unreleased entries into "## ${version} - YYYY-MM-DD" before releasing.`,
  );
  process.exit(1);
}

let end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
if (end === -1) end = lines.length;

const notes = lines
  .slice(start + 1, end)
  .join("\n")
  .trim();

if (!notes || !/^###\s+/m.test(notes)) {
  console.error(`The ${version} changelog section has no release-note categories.`);
  process.exit(1);
}

process.stdout.write(`${notes}\n`);
