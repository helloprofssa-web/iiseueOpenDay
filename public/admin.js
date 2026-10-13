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

document.querySelector("#export-xlsx").addEventListener("click", () => {
  const turnName = (turn) => (turn === 1 ? "Primo turno" : "Secondo turno");
  const rows = [["Cognome", "Nome", "Scuola di provenienza", "Email", "Indirizzo", "Turno", "Persone", "Codice", "Iscritto il", "Ingresso"]];
  const sorted = [...currentReservations].sort((a, b) => a.turn - b.turn || a.lastName.localeCompare(b.lastName, "it"));
  for (const item of sorted) {
    rows.push([
      item.lastName, item.firstName, item.school, item.email,
      item.program === "applicate" ? "Scienze applicate" : "Tradizionale",
      turnName(item.turn), item.attendees, item.code, formatDate(item.createdAt),
      item.checkedInAt ? formatDate(item.checkedInAt) : "",
    ]);
  }
  const url = URL.createObjectURL(window.buildXlsx(rows));
  const link = document.createElement("a");
  link.href = url;
  link.download = `prenotazioni-open-day-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
});

adminKey = sessionStorage.getItem(keyStorageName) || "";
if (adminKey) {
  loadReservations().catch((error) => setMessage(loginMessage, error.message));
}
