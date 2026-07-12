// One-command release. Bumps the version in every manifest that must agree, then
// commits, tags `vX.Y.Z`, and pushes — so cutting an auto-updating release is a
// single step and the version bump can never be forgotten or half-applied.
//
//   npm run release -- 0.9.0-beta.3
//
// Auto-update is release-and-version based (the updater compares the running
// version to the newest release's `latest.json`), so the git tag MUST match the
// bundled version — this script guarantees that.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Correct on Windows too (handles the drive letter and the space in the path).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (rel) => join(ROOT, rel);

const next = process.argv[2];
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

function die(msg) {
  console.error(`\n  release: ${msg}\n`);
  process.exit(1);
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
}

if (!next) die("usage: npm run release -- <version>   e.g. npm run release -- 0.9.0-beta.3");
if (!VERSION_RE.test(next)) die(`"${next}" is not a valid version (expected x.y.z or x.y.z-tag.n)`);

// Guard rails: a clean tree on main, so the release commit is ONLY the bump.
if (git("status --porcelain")) die("working tree is not clean — commit or stash first");
const branch = git("rev-parse --abbrev-ref HEAD");
if (branch !== "main") die(`must release from main (on "${branch}")`);

// Current version is the source of truth in package.json.
const pkgPath = p("package.json");
const pkg = readFileSync(pkgPath, "utf8");
const cur = JSON.parse(pkg).version;
if (cur === next) die(`version is already ${next}`);
if (git(`tag -l v${next}`)) die(`tag v${next} already exists`);

console.log(`  release: ${cur} -> ${next}`);

// Replace the version in every file that must agree. Targeted string edits (not
// JSON re-serialisation) so formatting/comments are preserved.
function bump(rel, patternFor) {
  const path = p(rel);
  const text = readFileSync(path, "utf8");
  const { find, replace } = patternFor(cur, next);
  if (!text.includes(find)) die(`could not find version marker in ${rel} (looked for: ${find})`);
  writeFileSync(path, text.replace(find, replace));
  console.log(`    updated ${rel}`);
}

bump("package.json", (c, n) => ({ find: `"version": "${c}"`, replace: `"version": "${n}"` }));
bump("src-tauri/tauri.conf.json", (c, n) => ({ find: `"version": "${c}"`, replace: `"version": "${n}"` }));
bump("src-tauri/Cargo.toml", (c, n) => ({ find: `version = "${c}"`, replace: `version = "${n}"` }));
// Cargo.lock: only the mujify-tweaks package entry (other crates keep their versions).
bump("src-tauri/Cargo.lock", (c, n) => ({
  find: `name = "mujify-tweaks"\nversion = "${c}"`,
  replace: `name = "mujify-tweaks"\nversion = "${n}"`,
}));

// Commit, tag, push — the tag triggers the CI Release workflow.
git("add -A");
execSync(`git commit -m "Release v${next}"`, { cwd: ROOT, stdio: "inherit" });
execSync(`git tag -a v${next} -m "Mujify Tweaks v${next}"`, { cwd: ROOT, stdio: "inherit" });
console.log(`\n  pushing main + tag v${next}…`);
execSync("git push origin main", { cwd: ROOT, stdio: "inherit" });
execSync(`git push origin v${next}`, { cwd: ROOT, stdio: "inherit" });

console.log(`\n  released v${next} — CI will build, sign and publish it. Watch the Actions "Release" run.\n`);
