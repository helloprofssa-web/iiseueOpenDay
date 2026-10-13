const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminKey = "test-admin-key-for-open-day";
const checkinKey = "test-checkin-key-for-open-day";
let child;
let temporaryDirectory;
let baseUrl;
let serverErrorOutput = "";

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "open-day-test-"));
  child = spawn(process.execPath, [path.join(projectRoot, "server.js")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: "0",
      OPEN_DAY_ADMIN_KEY: adminKey,
      OPEN_DAY_CHECKIN_KEY: checkinKey,
      DATABASE_URL: "",
      SMTP_HOST: "",
      POSTGRES_URL: "",
      OPEN_DAY_DB_PATH: "memory://",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    serverErrorOutput += chunk;
  });

  baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Il server non si è avviato in tempo.")), 10_000);
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Il server è terminato durante l'avvio (${code}). ${serverErrorOutput}`));
    });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

function booking(attendees, turn = 1) {
  return {
    firstName: "Ada",
    lastName: "Rossi",
    school: "Scuola media Galileo",
    email: "Ada.Rossi@example.com",
    program: "tradizionale",
    turn: String(turn),
    attendees: String(attendees),
  };
}

async function reserve(attendees, turn = 1) {
  return fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(booking(attendees, turn)),
  });
}

test("prenotazioni: capienza per persona, concorrenza e gestione amministrativa", async () => {
  let response = await fetch(`${baseUrl}/api/availability`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).turns.map(({ available }) => available), [100, 100]);

  response = await fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "null",
  });
  assert.equal(response.status, 400);

  response = await reserve(3);
  assert.equal(response.status, 201);
  const firstReservation = await response.json();
  assert.match(firstReservation.code, /^[A-F0-9]{10}$/);
  assert.equal(firstReservation.attendees, 3);

  for (let index = 0; index < 32; index += 1) {
    response = await reserve(3);
    assert.equal(response.status, 201);
  }

  const finalSeatAttempts = await Promise.all([reserve(1), reserve(2)]);
  assert.deepEqual(finalSeatAttempts.map((result) => result.status).sort(), [201, 409]);
  const fullTurnAttempt = await reserve(1);
  assert.equal(fullTurnAttempt.status, 409);
  assert.equal((await fullTurnAttempt.json()).available, 0);

  response = await reserve(2, 2);
  assert.equal(response.status, 201);
  response = await fetch(`${baseUrl}/api/availability`);
  assert.deepEqual((await response.json()).turns.map(({ available }) => available), [0, 98]);

  response = await fetch(`${baseUrl}/api/admin/reservations`);
  assert.equal(response.status, 401);
  response = await fetch(`${baseUrl}/api/admin/reservations`, {
    headers: { "x-admin-key": adminKey },
  });
  assert.equal(response.status, 200);
  let adminData = await response.json();
  assert.equal(adminData.turns[0].booked, 100);
  const groupReservation = adminData.reservations.find((item) => item.attendees === 3);
  assert.ok(groupReservation);

  response = await fetch(`${baseUrl}/api/admin/reservations/${groupReservation.id}`, {
    method: "DELETE",
    headers: { "x-admin-key": adminKey },
  });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/admin/reservations`, {
    headers: { "x-admin-key": adminKey },
  });
  adminData = await response.json();
  assert.equal(adminData.turns[0].booked, 97);
  assert.equal(adminData.turns[0].available, 3);

  response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Liceo scientifico/);
});

test("biglietto, verifica all'ingresso e annullamento da parte del visitatore", async () => {
  let response = await reserve(2, 2);
  assert.equal(response.status, 201);
  const { code, emailSent, ticketUrl } = await response.json();
  assert.equal(emailSent, false);
  assert.ok(ticketUrl.endsWith(`/ticket?code=${code}`));

  response = await fetch(`${baseUrl}/api/ticket?code=${code.toLowerCase()}`);
  assert.equal(response.status, 200);
  const { ticket, qr } = await response.json();
  assert.equal(ticket.lastName, "Rossi");
  assert.match(qr, /^data:image\/png;base64,/);
  response = await fetch(`${baseUrl}/api/ticket?code=0000000000`);
  assert.equal(response.status, 404);

  const checkIn = (value, key = checkinKey) => fetch(`${baseUrl}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-checkin-key": key },
    body: JSON.stringify({ code: value }),
  });
  assert.equal((await checkIn(code, "chiave-errata")).status, 401);
  assert.equal((await checkIn(code, adminKey)).status, 401);
  assert.equal((await checkIn(code, adminKey)).status, 401);
  response = await checkIn(code);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyCheckedIn, false);
  response = await checkIn(code);
  assert.equal((await response.json()).alreadyCheckedIn, true);
  assert.equal((await checkIn("FFFFFFFFFF")).status, 404);

  const cancel = (email) => fetch(`${baseUrl}/api/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, email }),
  });
  assert.equal((await cancel("altra@example.com")).status, 404);
  assert.equal((await cancel("ada.rossi@EXAMPLE.com")).status, 200);
  assert.equal((await cancel("ada.rossi@example.com")).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/ticket?code=${code}`)).status, 404);

  response = await fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...booking(1), email: "non-una-email" }),
  });
  assert.equal(response.status, 400);
});
