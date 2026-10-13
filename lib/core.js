const crypto = require("node:crypto");
const QRCode = require("qrcode");
const db = require("./db");
const { sendConfirmationEmail } = require("./mail");

const CAPACITY_PER_TURN = Number.parseInt(process.env.OPEN_DAY_CAPACITY, 10) || 150;
// Le iscrizioni si chiudono alla fine del 4 novembre (ora italiana).
const REGISTRATION_DEADLINE = process.env.OPEN_DAY_DEADLINE || "2026-11-04T23:59:59+01:00";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-F0-9]{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function normalizeEmail(value) {
  const email = normalizeText(value, 120);
  return email && EMAIL_PATTERN.test(email) ? email.toLowerCase() : null;
}

function normalizeCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
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

function checkKey(headers, envName, headerName, label) {
  const expected = process.env[envName];
  if (!expected) {
    return { status: 503, body: { error: `Accesso ${label} non configurato sul server.` } };
  }
  const provided = headers[headerName];
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(typeof provided === "string" ? provided : "").digest();
  if (typeof provided !== "string" || !crypto.timingSafeEqual(expectedHash, providedHash)) {
    return { status: 401, body: { error: "Password non valida." } };
  }
  return null;
}

const checkAdmin = (headers) => checkKey(headers, "OPEN_DAY_ADMIN_KEY", "x-admin-key", "amministratore");
const checkCheckIn = (headers) => checkKey(headers, "OPEN_DAY_CHECKIN_KEY", "x-checkin-key", "check-in");

async function getAvailability() {
  return {
    status: 200,
    body: { turns: await readAvailability(), deadline: REGISTRATION_DEADLINE, now: new Date().toISOString() },
  };
}

async function createReservation(data, baseUrl) {
  if (Date.now() > new Date(REGISTRATION_DEADLINE).getTime()) {
    return { status: 403, body: { error: "Le iscrizioni sono chiuse: il termine era il 4 novembre." } };
  }
  const invalid = { status: 400, body: { error: "Controlla i dati inseriti e riprova." } };
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid;

  const firstName = normalizeText(data.firstName, 80);
  const lastName = normalizeText(data.lastName, 80);
  const school = normalizeText(data.school, 120);
  const email = normalizeEmail(data.email);
  const program = data.program;
  const turn = Number(data.turn);
  const attendees = Number(data.attendees);
  if (
    !firstName ||
    !lastName ||
    !school ||
    !email ||
    !["tradizionale", "applicate"].includes(program) ||
    ![1, 2].includes(turn) ||
    ![1, 2, 3].includes(attendees)
  ) {
    return invalid;
  }

  const outcome = await db.transaction(async (tx) => {
    // Serializza tutte le prenotazioni: capienza e doppie iscrizioni non possono essere aggirate.
    await tx.query("SELECT pg_advisory_xact_lock(1)");
    const duplicate = await tx.query(
      "SELECT 1 FROM reservations WHERE lower(email) = $1 LIMIT 1",
      [email],
    );
    if (duplicate.rows.length > 0) return { duplicate: true };
    const { rows } = await tx.query(
      "SELECT COALESCE(SUM(attendees), 0)::int AS booked FROM reservations WHERE turn = $1",
      [turn],
    );
    const available = CAPACITY_PER_TURN - rows[0].booked;
    if (attendees > available) return { available };

    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    await tx.query(
      `INSERT INTO reservations (id, code, first_name, last_name, school, email, program, turn, attendees)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), code, firstName, lastName, school, email, program, turn, attendees],
    );
    return { code };
  });

  if (outcome.duplicate) {
    return {
      status: 409,
      body: {
        error: "Esiste già una prenotazione con questa email. " +
          "Per cambiare turno annulla prima la prenotazione esistente.",
      },
    };
  }
  if (!outcome.code) {
    return {
      status: 409,
      body: {
        error: "Non ci sono abbastanza posti disponibili per questo gruppo.",
        available: outcome.available,
      },
    };
  }

  const ticketUrl = `${baseUrl}/ticket?code=${outcome.code}`;
  const emailSent = await sendConfirmationEmail({
    email,
    firstName,
    code: outcome.code,
    turn,
    attendees,
    ticketUrl,
    cancelUrl: `${baseUrl}/cancel?code=${outcome.code}`,
  });
  return { status: 201, body: { code: outcome.code, turn, attendees, emailSent, ticketUrl } };
}

async function getTicket(code) {
  const normalized = normalizeCode(code);
  const notFound = { status: 404, body: { error: "Biglietto non trovato." } };
  if (!normalized) return notFound;
  const { rows } = await db.query(
    `SELECT code, first_name AS "firstName", last_name AS "lastName", school, program, turn, attendees
     FROM reservations WHERE code = $1`,
    [normalized],
  );
  if (rows.length === 0) return notFound;
  const qr = await QRCode.toDataURL(normalized, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  return { status: 200, body: { ticket: rows[0], qr } };
}

async function cancelReservation(data) {
  const code = normalizeCode(data && data.code);
  const email = normalizeEmail(data && data.email);
  const mismatch = { status: 404, body: { error: "Codice o email non corretti." } };
  if (!code || !email) return mismatch;
  const { rows } = await db.query(
    "DELETE FROM reservations WHERE code = $1 AND email = $2 RETURNING id",
    [code, email],
  );
  return rows.length === 0 ? mismatch : { status: 200, body: { cancelled: true } };
}

async function checkIn(headers, data) {
  const denied = checkCheckIn(headers);
  if (denied) return denied;
  const code = normalizeCode(data && data.code);
  const notFound = { status: 404, body: { valid: false, error: "Prenotazione non trovata o annullata." } };
  if (!code) return notFound;

  const columns = `code, first_name AS "firstName", last_name AS "lastName", school, program, turn,
                   attendees, checked_in_at AS "checkedInAt"`;
  const updated = await db.query(
    `UPDATE reservations SET checked_in_at = now()
     WHERE code = $1 AND checked_in_at IS NULL RETURNING ${columns}`,
    [code],
  );
  if (updated.rows.length > 0) {
    return { status: 200, body: { valid: true, alreadyCheckedIn: false, reservation: serialize(updated.rows[0]) } };
  }
  const existing = await db.query(`SELECT ${columns} FROM reservations WHERE code = $1`, [code]);
  if (existing.rows.length === 0) return notFound;
  return { status: 200, body: { valid: true, alreadyCheckedIn: true, reservation: serialize(existing.rows[0]) } };
}

function serialize(row) {
  return { ...row, checkedInAt: row.checkedInAt ? new Date(row.checkedInAt).toISOString() : null };
}

async function listReservations(headers) {
  const denied = checkAdmin(headers);
  if (denied) return denied;
  const { rows } = await db.query(`
    SELECT id, code, first_name AS "firstName", last_name AS "lastName", school, email, program,
           turn, attendees, created_at AS "createdAt", checked_in_at AS "checkedInAt"
    FROM reservations
    ORDER BY created_at DESC
  `);
  const reservations = rows.map((row) => ({
    ...serialize(row),
    createdAt: new Date(row.createdAt).toISOString(),
  }));
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

module.exports = {
  getAvailability,
  createReservation,
  getTicket,
  cancelReservation,
  checkIn,
  listReservations,
  deleteReservation,
};
