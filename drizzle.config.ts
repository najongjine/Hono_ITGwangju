import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const envFile =
  process.env.ENV_FILE ??
  (process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development");
dotenv.config({ path: envFile });

const databaseUrl = process.env.DATABASE_URL ?? (() => {
  const url = new URL("postgresql://localhost");
  url.username = process.env.DB_USERNAME ?? "";
  url.password = process.env.DB_PASSWORD ?? "";
  url.hostname = process.env.DB_HOST ?? "";
  url.port = process.env.DB_PORT || "5432";
  url.pathname = `/${process.env.DB_NAME ?? ""}`;
  url.searchParams.set("sslmode", "require");
  return url.toString();
})();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
