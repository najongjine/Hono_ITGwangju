import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { cors } from "hono/cors";
import * as dotenv from "dotenv";
import { pool } from "./db/index.js";
import { openApiSpec } from "./openapi.js";
import courseRouter from "./routes/course_router.js";
import fileRouter from "./routes/file_router.js";
import supabaseTestRouter from "./routes/supabase_test_router.js";
import testRouter from "./routes/test_router.js";

const envFile =
  process.env.ENV_FILE ??
  (process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development");
dotenv.config({ path: envFile });

const app = new Hono();

app.use(cors());

pool
  .connect()
  .then((client) => {
    client.release();
    console.log("Database pool has been initialized!");
  })
  .catch((err) => {
    console.error("Error during database pool initialization:", err);
  });

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/openapi.json", (c) => c.json(openApiSpec));
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.get("/", async (c) => {
  let result: { success: boolean; data: any; code: string; message: string } = {
    success: true,
    data: process.env.ENV_FILE || "",
    code: "",
    message: ``,
  };
  try {
    const q = String(c.req.query("q") ?? "");
    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.message = `error. ${error?.message ?? ""}`;
    return c.json(result);
  }
});

app.route("/api/file", fileRouter);
app.route("/api/courses", courseRouter);
app.route("/api/supabase-test", supabaseTestRouter);
app.route("/api/test", testRouter);

serve(
  {
    fetch: app.fetch,
    port: parseInt(process.env.PORT || "7860"),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
