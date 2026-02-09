import { Elysia, t } from "elysia";
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
const service = createAttachmentService(repo, getStorageDir());

export const attachmentRoutes = new Elysia({ prefix: "/attachments" })
  .get("/task/:taskId", ({ params }) => service.listByTaskId(params.taskId))
  .post(
    "/task/:taskId",
    async ({ params, body }) => {
      const file = body.file;
      const data = new Uint8Array(await file.arrayBuffer());
      return service.upload(params.taskId, data, file.name, file.type);
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    },
  )
  .delete("/:id", ({ params }) => {
    service.remove(params.id);
    return { ok: true };
  })
  .get("/:id/file", ({ params }) => {
    const filePath = service.getFilePath(params.id);
    if (!filePath) throw new Error("Attachment not found");
    return new Response(Bun.file(filePath));
  });

export { service as attachmentService };
