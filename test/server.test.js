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

function booking(attendees, turn = 1, id = "") {
  return {
    firstName: `Ada${id}`,
    lastName: `Rossi${id}`,
    school: "Scuola media Galileo",
    email: `Ada.Rossi${id}@example.com`,
    program: "tradizionale",
    turn: String(turn),
    attendees: String(attendees),
  };
}

let sequence = 0;

async function reserve(attendees, turn = 1, id = `-${(sequence += 1)}`) {
  return fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(booking(attendees, turn, id)),
  });
}

test("prenotazioni: capienza per persona, concorrenza e gestione amministrativa", async () => {
  let response = await fetch(`${baseUrl}/api/availability`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).turns.map(({ available }) => available), [150, 150]);

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

  for (let index = 0; index < 48; index += 1) {
    response = await reserve(3);
    assert.equal(response.status, 201);
  }
  assert.equal((await reserve(2)).status, 201);

  const finalSeatAttempts = await Promise.all([reserve(1), reserve(1)]);
  assert.deepEqual(finalSeatAttempts.map((result) => result.status).sort(), [201, 409]);
  const fullTurnAttempt = await reserve(1);
  assert.equal(fullTurnAttempt.status, 409);
  assert.equal((await fullTurnAttempt.json()).available, 0);

  response = await reserve(2, 2);
  assert.equal(response.status, 201);
  response = await fetch(`${baseUrl}/api/availability`);
  assert.deepEqual((await response.json()).turns.map(({ available }) => available), [0, 148]);

  // Una stessa email non può prenotare anche l'altro turno; gli omonimi con email diversa sì.
  response = await reserve(1, 2, "-1");
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /già una prenotazione/);
  response = await fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...booking(1, 2, "-new"), email: "ADA.rossi-1@example.com" }),
  });
  assert.equal(response.status, 409);

  response = await fetch(`${baseUrl}/api/send-tickets`, { method: "POST" });
  assert.equal(response.status, 401);
  response = await fetch(`${baseUrl}/api/send-tickets`, { method: "POST", headers: { "x-admin-key": adminKey } });
  assert.equal(response.status, 409);

  response = await fetch(`${baseUrl}/api/admin/reservations`);
  assert.equal(response.status, 401);
  response = await fetch(`${baseUrl}/api/admin/reservations`, {
    headers: { "x-admin-key": adminKey },
  });
  assert.equal(response.status, 200);
  let adminData = await response.json();
  assert.equal(adminData.turns[0].booked, 150);
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
  assert.equal(adminData.turns[0].booked, 147);
  assert.equal(adminData.turns[0].available, 3);

  response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /href="\/tecnico"/);
  response = await fetch(`${baseUrl}/liceo`);
  assert.match(await response.text(), /Liceo scientifico/);
  response = await fetch(`${baseUrl}/tecnico`);
  assert.equal(response.status, 200);
});

test("lo stesso studente può iscriversi sia al liceo sia al tecnico, con posti separati", async () => {
  const data = { ...booking(2, 2, "-both"), schoolType: "tecnico" };
  data.program = "turismo";
  const post = (body) => fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal((await post({ ...booking(2, 2, "-both"), schoolType: "liceo" })).status, 201);
  assert.equal((await post(data)).status, 201);
  assert.equal((await post(data)).status, 409);
  const tecnico = await (await fetch(`${baseUrl}/api/availability?school=tecnico`)).json();
  assert.equal(tecnico.turns[1].booked, 2);
  assert.equal((await fetch(`${baseUrl}/api/availability?school=altro`)).status, 400);
  const admin = await (await fetch(`${baseUrl}/api/admin/reservations`, { headers: { "x-admin-key": adminKey } })).json();
  assert.equal(admin.reservations.filter((r) => r.email === "ada.rossi-both@example.com").length, 2);
  assert.equal(admin.schools.tecnico[1].booked, 2);
});

test("biglietto, verifica all'ingresso e annullamento da parte del visitatore", async () => {
  let response = await reserve(2, 2, "");
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
    body: JSON.stringify({ ...booking(1, 1, "-x"), email: "non-una-email" }),
  });
  assert.equal(response.status, 400);
});

test("mini stage: giornate fisse, iscrizione, doppione e annullamento", async () => {
  const admin = { "x-admin-key": adminKey, "Content-Type": "application/json" };
  const json = (method, path, body, headers = admin) =>
    fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const listFor = async (school) => (await (await fetch(`${baseUrl}/api/ministages?school=${school}`)).json()).ministages;
  const id = "tecnico-2026-11-16";

  const tecnico = await listFor("tecnico");
  assert.equal(tecnico.length, 5);
  assert.equal((await listFor("liceo")).length, 5);
  assert.ok(tecnico.every((item) => item.schoolType === "tecnico" && new Date(item.startsAt) > new Date()));
  assert.equal(tecnico.find((item) => item.id === id).available, 20);

  const student = { ministageId: id, program: "turismo", firstName: "Ada", lastName: "Rossi", school: "Media", email: "ada.ms@example.com" };
  let response = await json("POST", "/api/ministages", student, {});
  assert.equal(response.status, 201);
  const { code } = await response.json();
  assert.equal((await json("POST", "/api/ministages", student, {})).status, 409);
  const otherDay = { ...student, ministageId: "tecnico-2026-11-17" };
  assert.equal((await json("POST", "/api/ministages", otherDay, {})).status, 409);
  assert.equal((await json("POST", "/api/ministages", { ...otherDay, email: "x@example.com", program: "tradizionale" }, {})).status, 400);
  assert.equal((await json("POST", "/api/ministages", { ...otherDay, email: "x@example.com", program: undefined }, {})).status, 400);
  assert.equal((await json("GET", "/api/admin/ministages", undefined, {})).status, 401);

  const overview = await (await json("GET", "/api/admin/ministages")).json();
  assert.equal(overview.reservations.length, 1);
  assert.equal(overview.reservations[0].program, "turismo");
  assert.equal((await listFor("tecnico")).find((item) => item.id === id).available, 19);

  response = await json("POST", "/api/cancel", { code, email: student.email }, {});
  assert.equal(response.status, 200);
  assert.equal((await listFor("tecnico")).find((item) => item.id === id).available, 20);
});