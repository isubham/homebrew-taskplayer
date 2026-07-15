import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const destructivePatterns = [
  ["DROP TABLE", /\bdrop\s+table\b/i],
  ["DROP COLUMN", /\bdrop\s+column\b/i],
  ["RENAME TABLE/COLUMN", /\brename\s+(?:table|column|to)\b/i],
  ["ALTER COLUMN TYPE", /\balter\s+column\b[\s\S]{0,100}\btype\b/i],
  ["SET NOT NULL", /\balter\s+column\b[\s\S]{0,100}\bset\s+not\s+null\b/i],
];

const failures = [];

for (const file of files) {
  const sql = readFileSync(join(migrationDir.pathname, file), "utf8");
  if (/compatibility-approved:\s*destructive/i.test(sql)) continue;

  const executableSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");

  for (const [label, pattern] of destructivePatterns) {
    if (pattern.test(executableSql)) failures.push(`${file}: ${label}`);
  }
}

if (failures.length) {
  console.error("Backward-compatibility check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Use an additive expand/migrate/contract change. Exceptional cleanup requires the reviewed marker: -- compatibility-approved: destructive",
  );
  process.exit(1);
}

console.log(`Checked ${files.length} Supabase migrations: no destructive schema changes.`);
