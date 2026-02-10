import { Elysia, t } from "elysia";
import { attachmentService } from "./instance.ts";

export const attachmentRoutes = new Elysia({ prefix: "/attachments" })
  .get("/task/:taskId", ({ params }) => attachmentService.listByTaskId(params.taskId))
  .post(
    "/task/:taskId",
    async ({ params, body }) => {
      const file = body.file;
      const data = new Uint8Array(await file.arrayBuffer());
      return attachmentService.upload(params.taskId, data, file.name, file.type);
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    },
  )
  .delete("/:id", ({ params }) => {
    attachmentService.remove(params.id);
    return { ok: true };
  })
  .get("/:id/file", ({ params }) => {
    const filePath = attachmentService.getFilePath(params.id);
    if (!filePath) throw new Error("Attachment not found");
    return new Response(Bun.file(filePath));
  });
