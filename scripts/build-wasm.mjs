// Purpose: builds the Rust engine's browser WebAssembly package on Windows and CI.
// Connects: pnpm build:wasm to wasm-pack and the web package's generated import.

import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = [
  "build",
  "engine",
  "--target",
  "web",
  "--out-dir",
  "../web/src/engine/pkg",
  "--out-name",
  "algotrace_engine",
  "--release",
];

const cargoBin = join(homedir(), ".cargo", "bin");
const localAppDataDirs = [process.env.LOCALAPPDATA, join(homedir(), "AppData", "Local")].filter(Boolean);
const cachedToolDirs = localAppDataDirs.flatMap((localAppData) => {
  const wasmPackCache = join(localAppData, ".wasm-pack");
  return existsSync(wasmPackCache)
    ? readdirSync(wasmPackCache, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => join(wasmPackCache, entry.name))
    : [];
});
const env = {
  ...process.env,
  PATH: [...cachedToolDirs, cargoBin, process.env.PATH ?? ""].join(delimiter),
};
const configuredBinary = process.env.WASM_PACK_BIN;
const windowsBinary = join(cargoBin, "wasm-pack.exe");
const binary = configuredBinary ?? (process.platform === "win32" && existsSync(windowsBinary) ? windowsBinary : "wasm-pack");
const result = spawnSync(binary, args, { stdio: "inherit", env });

if (result.error) {
  console.error(`Could not start wasm-pack (${binary}): ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
