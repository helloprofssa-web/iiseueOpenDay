const crypto = require("node:crypto");
const db = require("./db");

const CAPACITY_PER_TURN = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

async function readAvailability() {
  const { rows } = await db.query(
    "SELECT turn, COALESCE(SUM(attendees), 0)::int AS booked FROM reservations GROUP BY turn",
  );
  const bookedByTurn = new Map(rows.map((row) => [row.turn, row.booked]));
  return [1, 2].map((turn) => {
    const booked = bookedByTurn.get(turn) || 0;
    return { turn, capacity: CAPACITY_PER_TURN, booked, available: CAPACITY_PER_TURN - booked };
  });
}

function checkAdmin(headers) {
  const expected = process.env.OPEN_DAY_ADMIN_KEY;
  if (!expected) {
    return { status: 503, body: { error: "Accesso amministratore non configurato sul server." } };
  }
  const provided = headers["x-admin-key"];
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(typeof provided === "string" ? provided : "").digest();
  if (typeof provided !== "string" || !crypto.timingSafeEqual(expectedHash, providedHash)) {
    return { status: 401, body: { error: "Chiave amministratore non valida." } };
  }
  return null;
}

async function getAvailability() {
  return { status: 200, body: { turns: await readAvailability() } };
}

async function createReservation(data) {
  const invalid = { status: 400, body: { error: "Controlla i dati inseriti e riprova." } };
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid;

  const firstName = normalizeText(data.firstName, 80);
  const lastName = normalizeText(data.lastName, 80);
  const school = normalizeText(data.school, 120);
  const program = data.program;
  const turn = Number(data.turn);
  const attendees = Number(data.attendees);
  if (
    !firstName ||
    !lastName ||
    !school ||
    !["tradizionale", "applicate"].includes(program) ||
    ![1, 2].includes(turn) ||
    ![1, 2, 3].includes(attendees)
  ) {
    return invalid;
  }

  const outcome = await db.transaction(async (tx) => {
    // Serializza le prenotazioni dello stesso turno, così la capienza non può essere superata.
    await tx.query("SELECT pg_advisory_xact_lock($1::int)", [turn]);
    const { rows } = await tx.query(
      "SELECT COALESCE(SUM(attendees), 0)::int AS booked FROM reservations WHERE turn = $1",
      [turn],
    );
    const available = CAPACITY_PER_TURN - rows[0].booked;
    if (attendees > available) return { available };

    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    await tx.query(
      `INSERT INTO reservations (id, code, first_name, last_name, school, program, turn, attendees)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [crypto.randomUUID(), code, firstName, lastName, school, program, turn, attendees],
    );
    return { code };
  });

  if (outcome.code) return { status: 201, body: { code: outcome.code, turn, attendees } };
  return {
    status: 409,
    body: {
      error: "Non ci sono abbastanza posti disponibili per questo gruppo.",
      available: outcome.available,
    },
  };
}

async function listReservations(headers) {
  const denied = checkAdmin(headers);
  if (denied) return denied;
  const { rows } = await db.query(`
    SELECT id, code, first_name AS "firstName", last_name AS "lastName", school, program,
           turn, attendees, created_at AS "createdAt"
    FROM reservations
    ORDER BY created_at DESC
  `);
  const reservations = rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
  return { status: 200, body: { reservations, turns: await readAvailability() } };
}

async function deleteReservation(headers, id) {
  const denied = checkAdmin(headers);
  if (denied) return denied;
  const notFound = { status: 404, body: { error: "Prenotazione non trovata." } };
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return notFound;
  const { rows } = await db.query("DELETE FROM reservations WHERE id = $1 RETURNING id", [id]);
  return rows.length === 0 ? notFound : { status: 200, body: { deleted: true } };
}

module.exports = { getAvailability, createReservation, listReservations, deleteReservation };
