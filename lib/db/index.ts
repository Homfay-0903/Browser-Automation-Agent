import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Pooled HTTP connection — safe for serverless/edge and Next.js Server Components.
// Lazily initialized so importing db never throws (e.g. during a build that has
// no DATABASE_URL wired up); the throw only happens once a query actually runs.
let _db: ReturnType<typeof makeDb> | undefined;

function makeDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  // Pooled HTTP connection — safe for serverless/edge and Next.js Server Components.
  const sql = neon(process.env.DATABASE_URL);

  return drizzle({ client: sql, schema, casing: "snake_case" });
}

export function getDb() {
  if (!_db) _db = makeDb();
  return _db;
}

export { schema };
