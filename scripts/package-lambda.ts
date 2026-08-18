import { chmod, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const output = path.join(root, "dist/lambda");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, ".next/standalone"), output, { recursive: true });
  await mkdir(path.join(output, ".next"), { recursive: true });
  await cp(path.join(root, ".next/static"), path.join(output, ".next/static"), { recursive: true });
  await cp(path.join(root, "public"), path.join(output, "public"), { recursive: true });
  await cp(path.join(root, "infra/lambda/run.sh"), path.join(output, "run.sh"));
  await chmod(path.join(output, "run.sh"), 0o755);
  process.stdout.write(`packaged Lambda zip source at ${output}\n`);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
