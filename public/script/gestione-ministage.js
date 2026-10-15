const loginPanel = document.querySelector("#admin-login-panel");
const loginForm = document.querySelector("#admin-login-form");
const loginMessage = document.querySelector("#admin-login-message");
const dashboard = document.querySelector("#admin-dashboard");
const adminMessage = document.querySelector("#ministage-admin-message");
const listContainer = document.querySelector("#ministage-admin-list");
const keyStorageName = "open-day-admin-key";
const schoolNames = { liceo: "Liceo", tecnico: "Tecnico" };
let adminKey = "";
let state = { ministages: [], reservations: [] };

function setMessage(element, message, type = "error") {
  element.textContent = message;
  element.className = `form-message ${type}`;
  element.hidden = !message;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 503) {
      sessionStorage.removeItem(keyStorageName);
      adminKey = "";
      loginPanel.hidden = false;
      dashboard.hidden = true;
    }
    throw new Error(result.error || "Operazione non riuscita.");
  }
  return result;
}

function button(label, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function renderList() {
  listContainer.replaceChildren();
  if (state.ministages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nessuna giornata disponibile.";
    listContainer.append(empty);
    return;
  }
  for (const item of state.ministages) {
    const card = document.createElement("article");
    card.className = "reservation-card";
    card.style.flexDirection = "column";
    card.style.alignItems = "stretch";

    const top = document.createElement("div");
    top.className = "reservation-details";
    const title = document.createElement("h3");
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "reservation-meta";
    for (const text of [
      `Open Day ${schoolNames[item.schoolType]}`,
      item.endsAt ? `${formatDate(item.startsAt)} - ${new Intl.DateTimeFormat("it-IT", { timeStyle: "short" }).format(new Date(item.endsAt))}` : formatDate(item.startsAt),
      `${item.booked} / ${item.capacity} iscritti`,
    ].filter(Boolean)) {
      const span = document.createElement("span");
      span.textContent = text;
      meta.append(span);
    }
    top.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "reservation-actions";
    actions.append(
      button("Esporta email", "text-button", () => exportEmails(`email-${item.title}`, (r) => r.ministageId === item.id)),
    );

    const attendees = document.createElement("div");
    attendees.className = "reservations-list";
    for (const reservation of state.reservations.filter((r) => r.ministageId === item.id)) {
      const row = document.createElement("div");
      row.className = "reservation-card";
      const info = document.createElement("div");
      info.className = "reservation-details";
      const name = document.createElement("h3");
      name.textContent = `${reservation.lastName} ${reservation.firstName}`;
      const detail = document.createElement("p");
      detail.textContent = `${reservation.school} · ${reservation.email} · ${reservation.code}`;
      info.append(name, detail);
      const rowActions = document.createElement("div");
      rowActions.className = "reservation-actions";
      rowActions.append(button("Annulla", "cancel-button", () => removeReservation(reservation)));
      row.append(info, rowActions);
      attendees.append(row);
    }
    card.append(top, actions, attendees);
    listContainer.append(card);
  }
}

async function load() {
  state = await api("/api/admin/ministages");
  renderList();
  loginPanel.hidden = true;
  dashboard.hidden = false;
}

async function removeReservation(reservation) {
  if (!window.confirm(`Annullare l'iscrizione di ${reservation.firstName} ${reservation.lastName}?`)) return;
  try {
    await api(`/api/admin/ministages/${encodeURIComponent(reservation.id)}`, { method: "DELETE" });
    await load();
  } catch (error) {
    setMessage(adminMessage, error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminKey = loginForm.elements.key.value;
  try {
    await load();
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
});

function exportXlsx(schoolType) {
  const rows = [["Mini stage", "Data", "Cognome", "Nome", "Scuola di provenienza", "Email", "Open Day", "Codice", "Iscritto il"]];
  const byId = new Map(state.ministages.map((item) => [item.id, item]));
  const entries = state.reservations
    .map((reservation) => ({ reservation, ministage: byId.get(reservation.ministageId) }))
    .filter(({ ministage }) => ministage && ministage.schoolType === schoolType)
    .sort((a, b) => a.ministage.startsAt.localeCompare(b.ministage.startsAt)
      || a.ministage.title.localeCompare(b.ministage.title, "it")
      || a.reservation.lastName.localeCompare(b.reservation.lastName, "it"));
  for (const { reservation, ministage } of entries) {
    rows.push([
      ministage.title, formatDate(ministage.startsAt), reservation.lastName, reservation.firstName,
      reservation.school, reservation.email, schoolNames[schoolType], reservation.code, formatDate(reservation.createdAt),
    ]);
  }
  const url = URL.createObjectURL(window.buildXlsx(rows));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ministage-open-day-${schoolType}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportEmails(name, filter) {
  const emails = [...new Set(state.reservations.filter(filter).map((r) => r.email.toLowerCase()))].sort();
  if (emails.length === 0) {
    setMessage(adminMessage, "Non ci sono email da esportare.");
    return;
  }
  const url = URL.createObjectURL(window.buildXlsx([["Email"], ...emails.map((email) => [email])]));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSchoolEmails(schoolType) {
  const ids = new Set(state.ministages.filter((m) => m.schoolType === schoolType).map((m) => m.id));
  exportEmails(`email-ministage-${schoolType}`, (r) => ids.has(r.ministageId));
}

document.querySelector("#export-emails-liceo").addEventListener("click", () => exportSchoolEmails("liceo"));
document.querySelector("#export-emails-tecnico").addEventListener("click", () => exportSchoolEmails("tecnico"));
document.querySelector("#export-ministage-liceo").addEventListener("click", () => exportXlsx("liceo"));
document.querySelector("#export-ministage-tecnico").addEventListener("click", () => exportXlsx("tecnico"));

adminKey = sessionStorage.getItem(keyStorageName) || "";
if (adminKey) load().catch((error) => setMessage(loginMessage, error.message));
