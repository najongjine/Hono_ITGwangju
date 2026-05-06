import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as relations from "./relations.js";
import * as tables from "./schema.js";

const schema = { ...tables, ...relations };

const envFile =
  process.env.ENV_FILE ??
  (process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development");
dotenv.config({ path: envFile });

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || "5432"),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:
    process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
