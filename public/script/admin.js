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

const schoolNames = { liceo: "Liceo", tecnico: "Tecnico" };
const programNames = {
  tradizionale: "Liceo scientifico tradizionale",
  applicate: "Scienze applicate",
  afm: "Amministrazione Finanza & Marketing",
  turismo: "Turismo",
};

function renderCapacity(schools) {
  const container = document.querySelector("#admin-capacity");
  container.replaceChildren();
  for (const [schoolType, turns] of Object.entries(schools)) {
    const heading = document.createElement("h3");
    heading.className = "full-width";
    heading.style.gridColumn = "1 / -1";
    heading.textContent = `Open Day ${schoolNames[schoolType]}`;
    container.append(heading);
    renderTurns(container, turns);
  }
}

function renderTurns(container, turns) {
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

let currentReservations = [];

function renderReservations(reservations) {
  currentReservations = reservations;
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
    program.textContent = programNames[reservation.program] || reservation.program;
    const time = document.createElement("span");
    time.textContent = formatDate(reservation.createdAt);
    const email = document.createElement("span");
    email.textContent = reservation.email || "Email non indicata";
    const entry = document.createElement("span");
    entry.className = reservation.checkedInAt ? "checked-in" : "";
    entry.textContent = reservation.checkedInAt
      ? `Entrato alle ${formatDate(reservation.checkedInAt)}`
      : "Non ancora entrato";
    const schoolLabel = document.createElement("span");
    schoolLabel.textContent = `Open Day ${schoolNames[reservation.schoolType] || schoolNames.liceo}`;
    meta.append(schoolLabel, turn, attendees, program, time, email, entry);
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
  renderCapacity(result.schools);
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

document.querySelector("#send-tickets")?.addEventListener("click", async (event) => {
  if (!window.confirm("Inviare ora il biglietto via email a tutti gli iscritti che non l'hanno ancora ricevuto?")) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch("/api/send-tickets", { method: "POST", headers: { "x-admin-key": adminKey } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Invio non riuscito.");
    const failed = result.failed ? ` Non consegnati: ${result.failed}.` : "";
    const remaining = result.remaining ? ` Ancora da inviare: ${result.remaining} (ripremi il pulsante).` : "";
    setMessage(globalMessage, `Biglietti inviati: ${result.sent}.${failed}${remaining}`, result.failed ? "error" : "success");
  } catch (error) {
    setMessage(globalMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

function exportXlsx(schoolType) {
  const turnName = (turn) => (turn === 1 ? "Primo turno" : "Secondo turno");
  const rows = [["Cognome", "Nome", "Scuola di provenienza", "Email", "Open Day", "Indirizzo", "Turno", "Persone", "Codice", "Iscritto il", "Ingresso"]];
  const sorted = currentReservations
    .filter((item) => (item.schoolType || "liceo") === schoolType)
    .sort((a, b) => a.turn - b.turn || a.lastName.localeCompare(b.lastName, "it"));
  for (const item of sorted) {
    rows.push([
      item.lastName, item.firstName, item.school, item.email, schoolNames[schoolType],
      programNames[item.program] || item.program,
      turnName(item.turn), item.attendees, item.code, formatDate(item.createdAt),
      item.checkedInAt ? formatDate(item.checkedInAt) : "",
    ]);
  }
  const url = URL.createObjectURL(window.buildXlsx(rows));
  const link = document.createElement("a");
  link.href = url;
  link.download = `prenotazioni-open-day-${schoolType}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#export-xlsx-liceo").addEventListener("click", () => exportXlsx("liceo"));
document.querySelector("#export-xlsx-tecnico").addEventListener("click", () => exportXlsx("tecnico"));

adminKey = sessionStorage.getItem(keyStorageName) || "";
if (adminKey) {
  loadReservations().catch((error) => setMessage(loginMessage, error.message));
}
