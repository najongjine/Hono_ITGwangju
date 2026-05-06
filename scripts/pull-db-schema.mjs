import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pullDir = resolve(root, ".drizzle-pull");
const srcDbDir = resolve(root, "src", "db");

function normalizeGeneratedFile(path) {
  let text = readFileSync(path, "utf8");

  // drizzle-kit v0.31.x can emit empty string defaults as .default('), which is invalid TS.
  text = text.replace(/\.default\('\)/g, '.default("")');

  // This project uses NodeNext, so relative TS imports need the runtime .js extension.
  text = text.replace(/from "\.\/schema";/g, 'from "./schema.js";');

  writeFileSync(path, text, "utf8");
}

if (existsSync(pullDir)) {
  rmSync(pullDir, { recursive: true, force: true });
}

execFileSync(
  "npx",
  ["drizzle-kit", "introspect", "--config", "drizzle.pull.config.ts"],
  {
    cwd: root,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

const generatedSchema = resolve(pullDir, "schema.ts");
const generatedRelations = resolve(pullDir, "relations.ts");

if (!existsSync(generatedSchema)) {
  throw new Error("drizzle-kit did not generate .drizzle-pull/schema.ts");
}

mkdirSync(srcDbDir, { recursive: true });
normalizeGeneratedFile(generatedSchema);
copyFileSync(generatedSchema, resolve(srcDbDir, "schema.ts"));

if (existsSync(generatedRelations)) {
  normalizeGeneratedFile(generatedRelations);
  copyFileSync(generatedRelations, resolve(srcDbDir, "relations.ts"));
}

rmSync(pullDir, { recursive: true, force: true });
