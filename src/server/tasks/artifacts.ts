import { join } from "node:path";

export interface Artifacts {
  proposal: string | null;
  design: string | null;
  tasks: string | null;
}

async function readFileOrNull(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (await file.exists()) {
    return file.text();
  }
  return null;
}

export async function readArtifacts(basePath: string, changeId: string): Promise<Artifacts> {
  const dir = join(basePath, "openspec/changes", changeId);
  const [proposal, design, tasks] = await Promise.all([
    readFileOrNull(join(dir, "proposal.md")),
    readFileOrNull(join(dir, "design.md")),
    readFileOrNull(join(dir, "tasks.md")),
  ]);
  return { proposal, design, tasks };
}
