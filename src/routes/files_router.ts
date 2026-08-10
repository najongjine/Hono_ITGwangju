import { Hono } from "hono";
import { getStoredFileResponse } from "../utils/course_image_utils.js";

const router = new Hono();

router.get("/", async (c) => {
  try {
    const fileId = Number(c.req.query("file_id"));
    if (!Number.isInteger(fileId) || fileId <= 0) {
      return c.json(
        {
          success: false,
          data: null,
          code: "INVALID_FILE_ID",
          message: "valid file_id query is required",
        },
        400
      );
    }

    return getStoredFileResponse(fileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "file not found" ? 404 : 500;

    return c.json(
      {
        success: false,
        data: null,
        code: status === 404 ? "FILE_NOT_FOUND" : "FILE_READ_ERROR",
        message,
      },
      status
    );
  }
});

export default router;
