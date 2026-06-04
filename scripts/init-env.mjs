import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPairs = [
  { example: ".env.example", target: ".env" },
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
    mergeMissingEnvKeys(pair, examplePath, targetPath);
    continue;
  }

  copyFileSync(examplePath, targetPath);
  console.log(`Created: ${pair.target}`);
}

function mergeMissingEnvKeys(pair, examplePath, targetPath) {
  const exampleContent = readFileSync(examplePath, "utf8");
  const targetContent = readFileSync(targetPath, "utf8");
  const targetKeys = readEnvKeys(targetContent);
  const missingLines = [];
  const missingKeys = [];

  for (const line of readEnvLines(exampleContent)) {
    const key = readEnvKey(line);

    if (!key || targetKeys.has(key)) {
      continue;
    }

    missingLines.push(line);
    missingKeys.push(key);
    targetKeys.add(key);
  }

  if (missingLines.length === 0) {
    console.log(`OK: ${pair.target} is up to date`);
    return;
  }

  const eol = targetContent.includes("\r\n") ? "\r\n" : "\n";
  const separator = targetContent === "" || targetContent.endsWith("\n") ? "" : eol;
  const nextContent = `${targetContent}${separator}${missingLines.join(eol)}${eol}`;

  writeFileSync(targetPath, nextContent);
  console.log(`Updated: ${pair.target} added ${missingKeys.join(", ")}`);
}

function readEnvKeys(content) {
  return new Set(readEnvLines(content).map(readEnvKey).filter(Boolean));
}

function readEnvLines(content) {
  const lines = content.split(/\r?\n/);

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function readEnvKey(line) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1] ?? null;
}
