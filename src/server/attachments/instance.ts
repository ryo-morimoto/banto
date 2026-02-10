import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { db } from "../db.ts";
import { createAttachmentRepository } from "./repository.ts";
import { createAttachmentService } from "./service.ts";

function getStorageDir(): string {
  const dataHome = process.env["XDG_DATA_HOME"] || join(process.env["HOME"]!, ".local/share");
  const dir = join(dataHome, "banto", "attachments");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const repo = createAttachmentRepository(db);
export const attachmentService = createAttachmentService(repo, getStorageDir());
