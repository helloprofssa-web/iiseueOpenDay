const crypto = require("node:crypto");
const db = require("./db");
const core = require("./core");

const CAPACITY = Number.parseInt(process.env.OPEN_DAY_MINISTAGE_CAPACITY, 10) || 20;

// Giornate dei mini stage (ora italiana, novembre = UTC+1). Per cambiarle basta modificare questo elenco.
const WEEKS = {
  liceo: { label: "Liceo Scientifico", days: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"] },
  tecnico: { label: "Istituto Tecnico", days: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"] },
};
const START_TIME = "08:55";
const END_TIME = "12:55";

const MINISTAGES = Object.entries(WEEKS).flatMap(([schoolType, { label, days }]) =>
  days.map((day) => ({
    id: `${schoolType}-${day}`,
    schoolType,
    day,
    title: `Mini stage ${label}`,
    startsAt: `${day}T${START_TIME}:00+01:00`,
    endsAt: `${day}T${END_TIME}:00+01:00`,
  })),
);
const MINISTAGE_BY_ID = new Map(MINISTAGES.map((item) => [item.id, item]));

async function readBooked() {
  const { rows } = await db.query(
    "SELECT ministage_id AS id, COUNT(*)::int AS booked FROM ministage_signups GROUP BY ministage_id",
  );
  return new Map(rows.map((row) => [row.id, row.booked]));
}

function describe(item, booked) {
  const count = booked.get(item.id) || 0;
  return {
    id: item.id,
    schoolType: item.schoolType,
    title: item.title,
    startsAt: new Date(item.startsAt).toISOString(),
    endsAt: new Date(item.endsAt).toISOString(),
    capacity: CAPACITY,
    booked: count,
    available: CAPACITY - count,
  };
}

async function listPublicMinistages(school) {
  if (!WEEKS[school]) return { status: 400, body: { error: "Indirizzo non valido." } };
  const booked = await readBooked();
  const ministages = MINISTAGES
    .filter((item) => item.schoolType === school && new Date(item.startsAt).getTime() > Date.now())
    .map((item) => describe(item, booked));
  return { status: 200, body: { ministages } };
}

async function createMinistageReservation(data) {
  const invalid = { status: 400, body: { error: "Controlla i dati inseriti e riprova." } };
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid;
  const firstName = core.normalizeText(data.firstName, 80);
  const lastName = core.normalizeText(data.lastName, 80);
  const school = core.normalizeText(data.school, 120);
  const email = core.normalizeEmail(data.email);
  const item = MINISTAGE_BY_ID.get(data.ministageId);
  if (!firstName || !lastName || !school || !email || !item) return invalid;
  if (new Date(item.startsAt).getTime() <= Date.now()) {
    return { status: 403, body: { error: "Le iscrizioni a questo mini stage sono chiuse." } };
  }

  const outcome = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(2)");
    const { rows } = await tx.query(
      "SELECT COUNT(*)::int AS booked FROM ministage_signups WHERE ministage_id = $1",
      [item.id],
    );
    if (rows[0].booked >= CAPACITY) return { full: true };
    const duplicate = await tx.query(
      "SELECT 1 FROM ministage_signups WHERE ministage_id = $1 AND email = $2",
      [item.id, email],
    );
    if (duplicate.rows.length > 0) return { duplicate: true };
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    await tx.query(
      `INSERT INTO ministage_signups (id, code, ministage_id, school_type, first_name, last_name, school, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [crypto.randomUUID(), code, item.id, item.schoolType, firstName, lastName, school, email],
    );
    return { code };
  });

  if (outcome.full) return { status: 409, body: { error: "Posti esauriti per questa giornata." } };
  if (outcome.duplicate) {
    return { status: 409, body: { error: "Esiste già una prenotazione con questa email per questa giornata." } };
  }
  return { status: 201, body: { code: outcome.code, title: `${item.title} · ${item.day}` } };
}

async function listAdminMinistages(headers) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const booked = await readBooked();
  const { rows } = await db.query(
    `SELECT id, code, ministage_id AS "ministageId", first_name AS "firstName", last_name AS "lastName",
            school, email, created_at AS "createdAt"
     FROM ministage_signups ORDER BY created_at`,
  );
  return {
    status: 200,
    body: {
      ministages: MINISTAGES.map((item) => describe(item, booked)),
      reservations: rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })),
    },
  };
}

async function deleteMinistageReservation(headers, id) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const notFound = { status: 404, body: { error: "Prenotazione non trovata." } };
  if (typeof id !== "string" || !core.UUID_PATTERN.test(id)) return notFound;
  const { rows } = await db.query("DELETE FROM ministage_signups WHERE id = $1 RETURNING id", [id]);
  return rows.length === 0 ? notFound : { status: 200, body: { deleted: true } };
}

module.exports = {
  listPublicMinistages,
  createMinistageReservation,
  listAdminMinistages,
  deleteMinistageReservation,
};
