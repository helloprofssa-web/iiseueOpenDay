const loginPanel = document.querySelector("#admin-login-panel");
const loginForm = document.querySelector("#admin-login-form");
const loginMessage = document.querySelector("#admin-login-message");
const dashboard = document.querySelector("#admin-dashboard");
const globalMessage = document.querySelector("#admin-global-message");
const keyStorageName = "open-day-admin-key";
let adminKey = "";

function setMessage(element, message, type = "error") {
  element.textContent = message;
  element.className = `form-message ${type}`;
  element.hidden = !message;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderCapacity(turns) {
  const container = document.querySelector("#admin-capacity");
  container.replaceChildren();
  for (const turn of turns) {
    const card = document.createElement("article");
    card.className = `capacity-card${turn.turn === 2 ? " capacity-card-alt" : ""}${turn.available === 0 ? " is-full" : ""}`;
    const top = document.createElement("div");
    top.className = "capacity-top";
    const label = document.createElement("span");
    label.textContent = `TURNO 0${turn.turn}`;
    const status = document.createElement("span");
    status.className = "capacity-status";
    status.textContent = turn.available === 0 ? "Posti esauriti" : "Prenotazioni aperte";
    top.append(label, status);
    const name = document.createElement("div");
    name.className = "capacity-name";
    name.textContent = turn.turn === 1 ? "Primo turno" : "Secondo turno";
    const bottom = document.createElement("div");
    bottom.className = "capacity-bottom";
    const available = document.createElement("span");
    const availableCount = document.createElement("strong");
    availableCount.textContent = turn.available;
    available.append(availableCount, document.createTextNode(" posti disponibili"));
    const booked = document.createElement("span");
    booked.textContent = `${turn.booked} / ${turn.capacity}`;
    bottom.append(available, booked);
    const track = document.createElement("div");
    track.className = "capacity-track";
    const bar = document.createElement("span");
    bar.style.width = `${turn.booked}%`;
    track.append(bar);
    card.append(top, name, bottom, track);
    container.append(card);
  }
}

function renderReservations(reservations) {
  const container = document.querySelector("#reservations-list");
  container.replaceChildren();
  document.querySelector("#reservation-count").textContent =
    `${reservations.length} ${reservations.length === 1 ? "prenotazione" : "prenotazioni"}`;

  if (reservations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Non ci sono ancora prenotazioni.";
    container.append(empty);
    return;
  }

  for (const reservation of reservations) {
    const card = document.createElement("article");
    card.className = "reservation-card";
    const details = document.createElement("div");
    details.className = "reservation-details";
    const name = document.createElement("h3");
    name.textContent = `${reservation.firstName} ${reservation.lastName}`;
    const school = document.createElement("p");
    school.textContent = reservation.school;
    const meta = document.createElement("div");
    meta.className = "reservation-meta";
    const turn = document.createElement("span");
    turn.textContent = reservation.turn === 1 ? "Primo turno" : "Secondo turno";
    const attendees = document.createElement("span");
    attendees.textContent = `${reservation.attendees} ${reservation.attendees === 1 ? "persona" : "persone"}`;
    const program = document.createElement("span");
    program.textContent = reservation.program === "tradizionale"
      ? "Liceo scientifico tradizionale"
      : "Scienze applicate";
    const time = document.createElement("span");
    time.textContent = formatDate(reservation.createdAt);
    const email = document.createElement("span");
    email.textContent = reservation.email || "Email non indicata";
    const entry = document.createElement("span");
    entry.className = reservation.checkedInAt ? "checked-in" : "";
    entry.textContent = reservation.checkedInAt
      ? `Entrato alle ${formatDate(reservation.checkedInAt)}`
      : "Non ancora entrato";
    meta.append(turn, attendees, program, time, email, entry);
    details.append(name, school, meta);

    const actions = document.createElement("div");
    actions.className = "reservation-actions";
    const code = document.createElement("span");
    code.className = "reservation-code";
    code.textContent = reservation.code;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel-button";
    cancel.textContent = "Annulla";
    cancel.addEventListener("click", () => deleteReservation(reservation.id, name.textContent));
    actions.append(code, cancel);
    card.append(details, actions);
    container.append(card);
  }
}

async function loadReservations() {
  const response = await fetch("/api/admin/reservations", {
    headers: { "x-admin-key": adminKey },
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 503) {
      sessionStorage.removeItem(keyStorageName);
      adminKey = "";
      loginPanel.hidden = false;
      dashboard.hidden = true;
    }
    throw new Error(result.error || "Non è stato possibile caricare le prenotazioni.");
  }
  renderCapacity(result.turns);
  renderReservations(result.reservations);
  loginPanel.hidden = true;
  dashboard.hidden = false;
  setMessage(globalMessage, "");
}

async function deleteReservation(id, studentName) {
  if (!window.confirm(`Vuoi annullare la prenotazione di ${studentName}? I posti torneranno disponibili.`)) return;
  try {
    const response = await fetch(`/api/admin/reservations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-key": adminKey },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Non è stato possibile annullare la prenotazione.");
    await loadReservations();
    setMessage(globalMessage, "Prenotazione annullata e posti liberati.", "success");
  } catch (error) {
    setMessage(globalMessage, error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminKey = loginForm.elements.key.value;
  try {
    await loadReservations();
    sessionStorage.setItem(keyStorageName, adminKey);
    loginForm.reset();
  } catch (error) {
    setMessage(loginMessage, error.message);
  }
});

document.querySelector("#admin-logout").addEventListener("click", () => {
  sessionStorage.removeItem(keyStorageName);
  adminKey = "";
  dashboard.hidden = true;
  loginPanel.hidden = false;
  setMessage(loginMessage, "");
});

adminKey = sessionStorage.getItem(keyStorageName) || "";
if (adminKey) {
  loadReservations().catch((error) => setMessage(loginMessage, error.message));
}

const verifyForm = document.querySelector("#verify-form");
const verifyResult = document.querySelector("#verify-result");
const scanVideo = document.querySelector("#scan-video");
const scanToggle = document.querySelector("#scan-toggle");
let scanStream = null;
let scanTimer = null;
let verifying = false;

function showVerifyResult(kind, title, details = "") {
  verifyResult.replaceChildren();
  verifyResult.className = `verify-result ${kind}`;
  const heading = document.createElement("strong");
  heading.textContent = title;
  verifyResult.append(heading);
  if (details) {
    const text = document.createElement("span");
    text.textContent = details;
    verifyResult.append(text);
  }
  verifyResult.hidden = false;
}

async function verifyCode(rawValue) {
  const match = String(rawValue).toUpperCase().match(/[A-F0-9]{10}/);
  if (!match) return showVerifyResult("invalid", "QR code non valido", "Il contenuto non è un codice di prenotazione.");
  verifying = true;
  try {
    const response = await fetch("/api/admin/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ code: match[0] }),
    });
    const result = await response.json();
    if (response.status === 404) return showVerifyResult("invalid", "Prenotazione non valida", result.error);
    if (!response.ok) throw new Error(result.error || "Verifica non riuscita.");
    const { reservation } = result;
    const who = `${reservation.firstName} ${reservation.lastName} · ${reservation.school} · ` +
      `${reservation.turn === 1 ? "Primo turno" : "Secondo turno"} · ${reservation.attendees} ` +
      `${reservation.attendees === 1 ? "persona" : "persone"}`;
    if (result.alreadyCheckedIn) {
      showVerifyResult("warning", "Già entrato", `${who}. Ingresso registrato alle ${formatDate(reservation.checkedInAt)}.`);
    } else {
      showVerifyResult("valid", "Prenotazione valida", who);
      loadReservations().catch(() => {});
    }
  } catch (error) {
    showVerifyResult("invalid", "Errore", error.message);
  } finally {
    verifying = false;
  }
}

function stopScanning() {
  window.clearInterval(scanTimer);
  scanTimer = null;
  if (scanStream) scanStream.getTracks().forEach((track) => track.stop());
  scanStream = null;
  scanVideo.hidden = true;
  scanToggle.textContent = "Scansiona con la fotocamera";
}

async function startScanning() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    showVerifyResult("warning", "Scansione non supportata", "Questo browser non legge i QR code: usa Chrome o inserisci il codice a mano.");
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    scanVideo.srcObject = scanStream;
    scanVideo.hidden = false;
    await scanVideo.play();
    scanToggle.textContent = "Ferma la fotocamera";
    scanTimer = window.setInterval(async () => {
      if (verifying) return;
      const codes = await detector.detect(scanVideo).catch(() => []);
      if (codes.length > 0) {
        stopScanning();
        verifyCode(codes[0].rawValue);
      }
    }, 400);
  } catch {
    stopScanning();
    showVerifyResult("warning", "Fotocamera non disponibile", "Consenti l'accesso alla fotocamera oppure inserisci il codice a mano.");
  }
}

scanToggle.addEventListener("click", () => (scanStream ? stopScanning() : startScanning()));
verifyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  verifyCode(verifyForm.elements.code.value);
  verifyForm.reset();
});
