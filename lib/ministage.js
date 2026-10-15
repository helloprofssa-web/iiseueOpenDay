const crypto = require("node:crypto");
const db = require("./db");
const core = require("./core");

const SCHOOL_TYPES = ["liceo", "tecnico"];
const MINISTAGE_COLUMNS = `m.id, m.school_type AS "schoolType", m.title, m.description, m.location,
  m.starts_at AS "startsAt", m.ends_at AS "endsAt", m.capacity,
  (SELECT COUNT(*)::int FROM ministage_reservations r WHERE r.ministage_id = m.id) AS booked`;

function serializeMinistage(row) {
  return {
    ...row,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
    available: row.capacity - row.booked,
  };
}

function parseMinistage(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const title = core.normalizeText(data.title, 120);
  const description = data.description ? core.normalizeText(data.description, 1000) : "";
  const location = data.location ? core.normalizeText(data.location, 120) : "";
  const startsAt = new Date(data.startsAt);
  const capacity = Number(data.capacity);
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (
    endsAt &&
    (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)
  ) {
    return null;
  }
  if (
    !title ||
    description === null ||
    location === null ||
    !SCHOOL_TYPES.includes(data.schoolType) ||
    Number.isNaN(startsAt.getTime()) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 1000
  ) {
    return null;
  }
  return { schoolType: data.schoolType, title, description, location, startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    capacity,
  };
}

async function listPublicMinistages(school) {
  if (!SCHOOL_TYPES.includes(school)) return { status: 400, body: { error: "Indirizzo non valido." } };
  const { rows } = await db.query(
    `SELECT ${MINISTAGE_COLUMNS} FROM ministages m
     WHERE m.school_type = $1 AND m.starts_at > now() ORDER BY m.starts_at`,
    [school],
  );
  return { status: 200, body: { ministages: rows.map(serializeMinistage) } };
}

async function createMinistageReservation(data) {
  const invalid = { status: 400, body: { error: "Controlla i dati inseriti e riprova." } };
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid;
  const firstName = core.normalizeText(data.firstName, 80);
  const lastName = core.normalizeText(data.lastName, 80);
  const school = core.normalizeText(data.school, 120);
  const email = core.normalizeEmail(data.email);
  if (!firstName || !lastName || !school || !email || !core.UUID_PATTERN.test(String(data.ministageId))) {
    return invalid;
  }

  const outcome = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(2)");
    const { rows } = await tx.query(
      `SELECT ${MINISTAGE_COLUMNS} FROM ministages m WHERE m.id = $1 AND m.starts_at > now()`,
      [data.ministageId],
    );
    if (rows.length === 0) return { notFound: true };
    if (rows[0].booked >= rows[0].capacity) return { full: true };
    const duplicate = await tx.query(
      "SELECT 1 FROM ministage_reservations WHERE ministage_id = $1 AND email = $2",
      [data.ministageId, email],
    );
    if (duplicate.rows.length > 0) return { duplicate: true };
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    await tx.query(
      `INSERT INTO ministage_reservations (id, code, ministage_id, first_name, last_name, school, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), code, data.ministageId, firstName, lastName, school, email],
    );
    return { code, title: rows[0].title };
  });

  if (outcome.notFound) return { status: 404, body: { error: "Mini stage non disponibile." } };
  if (outcome.full) return { status: 409, body: { error: "Posti esauriti per questo mini stage." } };
  if (outcome.duplicate) {
    return { status: 409, body: { error: "Esiste già una prenotazione con questa email per questo mini stage." } };
  }
  return { status: 201, body: { code: outcome.code, title: outcome.title } };
}

async function listAdminMinistages(headers) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const ministages = await db.query(
    `SELECT ${MINISTAGE_COLUMNS} FROM ministages m ORDER BY m.starts_at DESC`,
  );
  const reservations = await db.query(
    `SELECT id, code, ministage_id AS "ministageId", first_name AS "firstName", last_name AS "lastName",
            school, email, created_at AS "createdAt"
     FROM ministage_reservations ORDER BY created_at`,
  );
  return {
    status: 200,
    body: {
      ministages: ministages.rows.map(serializeMinistage),
      reservations: reservations.rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })),
    },
  };
}

async function createMinistage(headers, data) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const values = parseMinistage(data);
  if (!values) return { status: 400, body: { error: "Controlla i dati del mini stage e riprova." } };
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO ministages (id, school_type, title, description, location, starts_at, ends_at, capacity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, values.schoolType, values.title, values.description, values.location, values.startsAt, values.endsAt, values.capacity],
  );
  return { status: 201, body: { id } };
}

async function updateMinistage(headers, id, data) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const notFound = { status: 404, body: { error: "Mini stage non trovato." } };
  if (typeof id !== "string" || !core.UUID_PATTERN.test(id)) return notFound;
  const values = parseMinistage(data);
  if (!values) return { status: 400, body: { error: "Controlla i dati del mini stage e riprova." } };
  const outcome = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(2)");
    const booked = await tx.query(
      "SELECT COUNT(*)::int AS n FROM ministage_reservations WHERE ministage_id = $1",
      [id],
    );
    if (values.capacity < booked.rows[0].n) return { tooSmall: booked.rows[0].n };
    const { rows } = await tx.query(
      `UPDATE ministages SET school_type = $2, title = $3, description = $4, location = $5,
         starts_at = $6, ends_at = $7, capacity = $8 WHERE id = $1 RETURNING id`,
      [id, values.schoolType, values.title, values.description, values.location, values.startsAt, values.endsAt, values.capacity],
    );
    return { found: rows.length > 0 };
  });
  if (outcome.tooSmall !== undefined) {
    return { status: 409, body: { error: `La capienza non può essere inferiore alle ${outcome.tooSmall} prenotazioni esistenti.` } };
  }
  return outcome.found ? { status: 200, body: { updated: true } } : notFound;
}

async function deleteMinistage(headers, id) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const notFound = { status: 404, body: { error: "Mini stage non trovato." } };
  if (typeof id !== "string" || !core.UUID_PATTERN.test(id)) return notFound;
  const { rows } = await db.query("DELETE FROM ministages WHERE id = $1 RETURNING id", [id]);
  return rows.length === 0 ? notFound : { status: 200, body: { deleted: true } };
}

async function deleteMinistageReservation(headers, id) {
  const denied = core.checkAdmin(headers);
  if (denied) return denied;
  const notFound = { status: 404, body: { error: "Prenotazione non trovata." } };
  if (typeof id !== "string" || !core.UUID_PATTERN.test(id)) return notFound;
  const { rows } = await db.query("DELETE FROM ministage_reservations WHERE id = $1 RETURNING id", [id]);
  return rows.length === 0 ? notFound : { status: 200, body: { deleted: true } };
}

module.exports = {
  listPublicMinistages,
  createMinistageReservation,
  listAdminMinistages,
  createMinistage,
  updateMinistage,
  deleteMinistage,
  deleteMinistageReservation,
};
