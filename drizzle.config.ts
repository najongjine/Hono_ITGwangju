import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const envFile =
  process.env.ENV_FILE ??
  (process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development");
dotenv.config({ path: envFile });

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME}`;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
