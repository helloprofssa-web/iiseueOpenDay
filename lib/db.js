const fs = require("node:fs");
const path = require("node:path");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    school TEXT NOT NULL,
    program TEXT NOT NULL CHECK (program IN ('tradizionale', 'applicate')),
    turn SMALLINT NOT NULL CHECK (turn IN (1, 2)),
    attendees SMALLINT NOT NULL CHECK (attendees IN (1, 2, 3)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS   ticket_sent_at TIMESTAMPTZ;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS school_type TEXT NOT NULL DEFAULT 'liceo';
    ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_program_check;
    CREATE TABLE IF NOT EXISTS ministages (
      id UUID PRIMARY KEY,
      school_type TEXT NOT NULL CHECK (school_type IN ('liceo', 'tecnico')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      starts_at TIMESTAMPTZ NOT NULL,
      capacity SMALLINT NOT NULL CHECK (capacity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ministages ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS ministage_reservations (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      ministage_id UUID NOT NULL REFERENCES ministages(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      school TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ministage_id, email)
    )
  `;

function createPostgresBackend(connectionString) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString, max: 3 });
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

// Database Postgres incorporato, usato solo in locale e nei test.
function createEmbeddedBackend() {
  let PGlite;
  try {
    ({ PGlite } = require("@electric-sql/pglite"));
  } catch {
    throw new Error("Database non configurato: imposta la variabile DATABASE_URL.");
  }
  const location = process.env.OPEN_DAY_DB_PATH || path.join(__dirname, "..", "data", "pglite");
  if (!location.startsWith("memory://")) fs.mkdirSync(location, { recursive: true });
  const database = new PGlite(location);
  return {
    query: (sql, params) => database.query(sql, params),
    exec: (sql) => database.exec(sql),
    transaction: (work) => database.transaction(work),
  };
}

let backendPromise;

function getBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
      const backend = url ? createPostgresBackend(url) : createEmbeddedBackend();
      await backend.exec(SCHEMA);
      return backend;
    })();
    backendPromise.catch(() => {
      backendPromise = undefined;
    });
  }
  return backendPromise;
}

module.exports = {
  async query(sql, params) {
    return (await getBackend()).query(sql, params);
  },
  async transaction(work) {
    return (await getBackend()).transaction(work);
  },
};
