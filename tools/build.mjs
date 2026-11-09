/**
 * 多脚本构建脚本。
 *
 * 目录约定：
 *   scripts/<脚本名>/src/               脚本源码
 *   scripts/<脚本名>/README.md          面向使用者的说明（会被复制到 dist）
 *   scripts/<脚本名>/script.config.json 脚本元数据声明
 *   dist/<脚本名>/                      构建产物（.user.js + .meta.js + README.md）

 * 产出两个文件：
 *   dist/<名>/<名>.user.js  完整脚本
 *   dist/<名>/<名>.meta.js  仅元数据，供脚本猫检查更新使用

 * 脚本猫的更新规则是 user.js => meta.js，
 * 两者同时存在时，脚本猫会自动比对 meta.js 里的 @version。
 *
 * 注意：本机 esbuild 的 CLI 会静默失败，这里统一走 Node API。
 */

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS_DIR = join(ROOT, "scripts");
const DIST = join(ROOT, "dist");

const REPO = "https://github.com/fangfuzha/scriptcat-scripts";
const MINIFY = process.argv.includes("--minify");

/** 读取 git commit，用于构建日志 */
function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "local";
  }
}

/** 列出所有脚本目录 */
function listScriptDirs() {
  if (!existsSync(SCRIPTS_DIR)) return [];
  return readdirSync(SCRIPTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(SCRIPTS_DIR, name, "src")));
}

/** 读取脚本配置 */
function readConfig(name) {
  const file = join(SCRIPTS_DIR, name, "script.config.json");
  if (!existsSync(file)) {
    throw new Error("缺少配置：" + file);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * 版本号：日期 + 当日构建序号，保证单调递增。
 *
 * 序号基于 dist 中已有的 meta.js 计算，
 * 这样 CI 每天多次构建也能得到递增的版本号。
 */
function resolveVersion(name) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const base = y + "." + m + "." + d;

  let seq = 1;
  try {
    const meta = readFileSync(join(DIST, name, name + ".meta.js"), "utf8");
    const line = meta.split("\n").find((l) => l.includes("@version"));
    if (line) {
      const parts = line.trim().split(/\s+/);
      const prev = parts[parts.length - 1];
      const seg = prev.split(".");
      if (seg.length >= 4 && seg.slice(0, 3).join(".") === base) {
        seq = parseInt(seg[3], 10) + 1;
      }
    }
  } catch {
    /* 首次构建 */
  }
  return base + "." + seq;
}

/** 生成元数据块 */
function buildMeta(config, version) {
  const lines = ["// ==UserScript=="];
  const push = (key, value) => {
    if (value === undefined || value === null) return;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) lines.push("// @" + key + " " + v);
  };

  push("name", config.name);
  push("namespace", config.namespace ?? REPO);
  push("version", version);
  push("author", config.author);
  push("description", config.description);
  push("license", config.license);
  push("homepage", config.homepage ?? REPO);
  push("homepageURL", config.homepage);
  push("website", config.website);
  push("supportURL", config.supportURL ?? REPO + "/issues");
  push("match", config.match);
  push("include", config.include);
  push("exclude", config.exclude);
  push("require", config.require);
  push("resource", config.resource);
  push("connect", config.connect);
  push("grant", config.grant);
  push("run-at", config["run-at"]);
  push("noframes", config.noframes);

  lines.push("// ==/UserScript==", "");
  return lines.join("\n");
}

/** 构建单个脚本 */
async function buildScript(name) {
  const config = readConfig(name);
  const version = resolveVersion(name);
  const meta = buildMeta(config, version);
  const outDir = join(DIST, name);

  mkdirSync(outDir, { recursive: true });

  const result = await build({
    entryPoints: [join(SCRIPTS_DIR, name, "src", "main.ts")],
    bundle: true,
    format: "iife",
    target: ["es2020"],
    minify: MINIFY,
    legalComments: "none",
    // 上游 Dark Reader 的编译期常量，用户脚本环境按 Chromium MV3 处理
    define: {
      __PLUS__: "false",
      __CHROMIUM_MV2__: "false",
      __CHROMIUM_MV3__: "true",
      __FIREFOX_MV2__: "false",
      __THUNDERBIRD__: "false",
      __TEST__: "false",
      __DEBUG__: "false",
      __LOG__: "false",
      __PORT__: "false",
      __WATCH__: "false",
    },
    banner: { js: meta },
    write: false,
  });

  writeFileSync(join(outDir, name + ".user.js"), result.outputFiles[0].text, "utf8");
  writeFileSync(join(outDir, name + ".meta.js"), meta, "utf8");

  // 复制面向使用者的说明文档
  const readme = join(SCRIPTS_DIR, name, "README.md");
  if (existsSync(readme)) {
    copyFileSync(readme, join(outDir, "README.md"));
  }

  console.log("built " + name + " version " + version);
  return { name, version };
}

/** 生成订阅合集文件 */
function buildSubscribe(built) {
  if (built.length === 0) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const version = y + "." + m + "." + d;

  const lines = [
    "// ==UserSubscribe==",
    "// @name        fangfuzha 脚本合集",
    "// @namespace   " + REPO,
    "// @version     " + version,
    "// @author      fangfuzha",
    "// @description fangfuzha 的脚本合集。订阅后由脚本猫按更新间隔静默检查并更新，无需手动确认。",
    "// @homepage    " + REPO,
    "// @license     MIT",
    "// @connect     *",
  ];

  for (const item of built) {
    lines.push("// @scriptUrl   https://fastly.jsdelivr.net/gh/fangfuzha/scriptcat-scripts@master/dist/" + item.name + "/" + item.name + ".user.js");
  }

  lines.push("// ==/UserSubscribe==", "");

  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, "fangfuzha脚本合集.user.sub.js"), lines.join("\n"), "utf8");
  console.log("built subscribe (" + built.length + " scripts)");
}

async function main() {
  const names = listScriptDirs();
  if (names.length === 0) {
    // 框架仓库允许暂时没有脚本，保证 dist 目录存在即可
    mkdirSync(DIST, { recursive: true });
    console.log("没有找到任何脚本目录，跳过构建");
    return;
  }

  const built = [];
  for (const name of names) {
    built.push(await buildScript(name));
  }

  buildSubscribe(built);
  console.log("done (" + gitCommit() + ")");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
