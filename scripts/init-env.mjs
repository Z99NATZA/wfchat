import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPairs = [
  { example: "apps/api/.env.example", target: "apps/api/.env" },
  { example: "apps/web/.env.example", target: "apps/web/.env" },
];

for (const pair of envPairs) {
  const examplePath = resolve(pair.example);
  const targetPath = resolve(pair.target);

  if (!existsSync(examplePath)) {
    console.error(`Missing template: ${pair.example}`);
    process.exitCode = 1;
    continue;
  }

  if (existsSync(targetPath)) {
    console.log(`Skip: ${pair.target} already exists`);
    continue;
  }

  copyFileSync(examplePath, targetPath);
  console.log(`Created: ${pair.target}`);
}
