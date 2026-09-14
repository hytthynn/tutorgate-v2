// Maintenance scripts run outside Next's bundled routes, so trace them separately.
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import nft from "next/dist/compiled/@vercel/nft/index.js";

const root = process.cwd();
const output = resolve(root, ".next/standalone");
const { fileList } = await nft.nodeFileTrace([
  "scripts/set-webhook.mjs",
  "scripts/cleanup-chat-storage.mjs",
], { base: root });
for (const file of fileList) {
  const source = resolve(root, file);
  const local = relative(root, source);
  if (local.startsWith("..") || isAbsolute(local)) throw new Error("Traced file outside project");
  const target = resolve(output, local);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
console.log(`Included ${fileList.size} maintenance script files in standalone output`);
