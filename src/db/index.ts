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

const ssl = process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };

export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || "5432"),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl,
      },
);

export const db = drizzle(pool, { schema });
