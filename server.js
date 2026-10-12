const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const CAPACITY_PER_TURN = 100;
const DATA_DIRECTORY = path.join(__dirname, "data");
const DATABASE_PATH = path.resolve(
  process.env.OPEN_DAY_DB_PATH || path.join(DATA_DIRECTORY, "reservations.sqlite"),
);

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/admin", ["admin.html", "text/html; charset=utf-8"]],
  ["/admin.html", ["admin.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message, extra = {}) {
  sendJson(response, statusCode, { error: message, ...extra });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (body.length + chunk.length > 10_000) {
        tooLarge = true;
      } else if (!tooLarge) {
        body += chunk;
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Richiesta troppo grande."), { statusCode: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("La richiesta non contiene JSON valido."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function createReservationCode(database) {
  let code;
  do {
    code = crypto.randomBytes(5).toString("hex").toUpperCase();
  } while (database.prepare("SELECT 1 FROM reservations WHERE code = ?").get(code));
  return code;
}

function getAvailability(database) {
  const rows = database.prepare(
    "SELECT turn, COALESCE(SUM(attendees), 0) AS booked FROM reservations GROUP BY turn",
  ).all();
  const bookedByTurn = new Map(rows.map((row) => [row.turn, row.booked]));
  return [1, 2].map((turn) => {
    const booked = bookedByTurn.get(turn) || 0;
    return { turn, capacity: CAPACITY_PER_TURN, booked, available: CAPACITY_PER_TURN - booked };
  });
}

function isAuthorizedAdmin(request, response) {
  const expected = process.env.OPEN_DAY_ADMIN_KEY;
  if (!expected) {
    sendError(response, 503, "Accesso amministratore non configurato sul server.");
    return false;
  }

  const provided = request.headers["x-admin-key"];
  if (typeof provided !== "string") {
    sendError(response, 401, "Chiave amministratore non valida.");
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    sendError(response, 401, "Chiave amministratore non valida.");
    return false;
  }
  return true;
}

async function main() {
  await fs.mkdir(path.dirname(DATABASE_PATH), { recursive: true });
  const database = new DatabaseSync(DATABASE_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      school TEXT NOT NULL,
      program TEXT NOT NULL CHECK (program IN ('tradizionale', 'applicate')),
      turn INTEGER NOT NULL CHECK (turn IN (1, 2)),
      attendees INTEGER NOT NULL CHECK (attendees IN (1, 2, 3)),
      created_at TEXT NOT NULL
    );
  `);

  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/availability") {
      sendJson(response, 200, { turns: getAvailability(database) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/reservations") {
      let data;
      try {
        data = await readJson(request);
      } catch (error) {
        sendError(response, error.statusCode || 400, error.message || "Richiesta non valida.");
        return;
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        sendError(response, 400, "Controlla i dati inseriti e riprova.");
        return;
      }

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
        sendError(response, 400, "Controlla i dati inseriti e riprova.");
        return;
      }

      let transactionStarted = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        transactionStarted = true;
        const booked = database.prepare(
          "SELECT COALESCE(SUM(attendees), 0) AS total FROM reservations WHERE turn = ?",
        ).get(turn).total;
        const available = CAPACITY_PER_TURN - booked;
        if (attendees > available) {
          database.exec("ROLLBACK");
          transactionStarted = false;
          sendError(response, 409, "Non ci sono abbastanza posti disponibili per questo gruppo.", {
            available,
          });
          return;
        }

        const id = crypto.randomUUID();
        const code = createReservationCode(database);
        database.prepare(`
          INSERT INTO reservations
            (id, code, first_name, last_name, school, program, turn, attendees, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, code, firstName, lastName, school, program, turn, attendees, new Date().toISOString());
        database.exec("COMMIT");
        transactionStarted = false;
        sendJson(response, 201, { code, turn, attendees });
      } catch (error) {
        if (transactionStarted) database.exec("ROLLBACK");
        console.error("Errore durante il salvataggio della prenotazione:", error);
        sendError(response, 500, "Non è stato possibile salvare la prenotazione.");
      }
      return;
    }

    if (url.pathname === "/api/admin/reservations" && request.method === "GET") {
      if (!isAuthorizedAdmin(request, response)) return;
      const reservations = database.prepare(`
        SELECT id, code, first_name AS firstName, last_name AS lastName,
               school, program, turn, attendees, created_at AS createdAt
        FROM reservations
        ORDER BY created_at DESC
      `).all();
      sendJson(response, 200, { reservations, turns: getAvailability(database) });
      return;
    }

    const deleteMatch = url.pathname.match(/^\/api\/admin\/reservations\/([0-9a-f-]{36})$/i);
    if (deleteMatch && request.method === "DELETE") {
      if (!isAuthorizedAdmin(request, response)) return;
      const result = database.prepare("DELETE FROM reservations WHERE id = ?").run(deleteMatch[1]);
      if (result.changes === 0) {
        sendError(response, 404, "Prenotazione non trovata.");
        return;
      }
      sendJson(response, 200, { deleted: true });
      return;
    }

    if (request.method === "GET" && staticFiles.has(url.pathname)) {
      const [fileName, contentType] = staticFiles.get(url.pathname);
      try {
        const content = await fs.readFile(path.join(__dirname, "public", fileName));
        response.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        });
        response.end(content);
      } catch (error) {
        console.error(`Errore durante la lettura di ${fileName}:`, error);
        sendError(response, 500, "Impossibile caricare la pagina.");
      }
      return;
    }

    sendError(response, 404, "Pagina o risorsa non trovata.");
  });

  server.listen(PORT, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : PORT;
    console.log(`Open Day disponibile su http://localhost:${port}`);
    if (!process.env.OPEN_DAY_ADMIN_KEY) {
      console.warn("Imposta OPEN_DAY_ADMIN_KEY per abilitare l'accesso amministratore.");
    }
  });

  const shutdown = () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Avvio dell'applicazione non riuscito:", error);
  process.exitCode = 1;
});
