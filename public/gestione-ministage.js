const loginPanel = document.querySelector("#admin-login-panel");
const loginForm = document.querySelector("#admin-login-form");
const loginMessage = document.querySelector("#admin-login-message");
const dashboard = document.querySelector("#admin-dashboard");
const adminForm = document.querySelector("#ministage-admin-form");
const adminMessage = document.querySelector("#ministage-admin-message");
const listContainer = document.querySelector("#ministage-admin-list");
const keyStorageName = "open-day-admin-key";
const schoolNames = { liceo: "Liceo", tecnico: "Tecnico" };
let adminKey = "";
let editingId = null;
let state = { ministages: [], reservations: [] };

function setMessage(element, message, type = "error") {
  element.textContent = message;
  element.className = `form-message ${type}`;
  element.hidden = !message;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toLocalInput(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
    empty.textContent = "Non ci sono ancora mini stage.";
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
      item.location,
      `${item.booked} / ${item.capacity} iscritti`,
    ].filter(Boolean)) {
      const span = document.createElement("span");
      span.textContent = text;
      meta.append(span);
    }
    top.append(title, meta);
    if (item.description) {
      const description = document.createElement("p");
      description.textContent = item.description;
      top.append(description);
    }

    const actions = document.createElement("div");
    actions.className = "reservation-actions";
    actions.append(
      button("Modifica", "text-button", () => startEdit(item)),
      button("Esporta email", "text-button", () => exportEmails(`email-${item.title}`, (r) => r.ministageId === item.id)),
      button("Elimina", "cancel-button", () => removeMinistage(item)),
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

function resetForm() {
  editingId = null;
  adminForm.reset();
  document.querySelector("#ministage-form-title").textContent = "Nuovo mini stage";
  document.querySelector("#ministage-submit-label").textContent = "Aggiungi mini stage";
  document.querySelector("#ministage-cancel-edit").hidden = true;
}

function startEdit(item) {
  editingId = item.id;
  adminForm.elements.schoolType.value = item.schoolType;
  adminForm.elements.title.value = item.title;
  adminForm.elements.startsAt.value = toLocalInput(item.startsAt);
  adminForm.elements.endTime.value = item.endsAt ? toLocalInput(item.endsAt).slice(11) : "";
  adminForm.elements.lastDay.value = "";
  adminForm.elements.capacity.value = item.capacity;
  adminForm.elements.location.value = item.location;
  adminForm.elements.description.value = item.description;
  document.querySelector("#ministage-form-title").textContent = "Modifica mini stage";
  document.querySelector("#ministage-submit-label").textContent = "Salva modifiche";
  document.querySelector("#ministage-cancel-edit").hidden = false;
  adminForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function removeMinistage(item) {
  if (!window.confirm(`Eliminare "${item.title}" e le ${item.booked} iscrizioni collegate?`)) return;
  try {
    await api(`/api/admin/ministages/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (editingId === item.id) resetForm();
    await load();
  } catch (error) {
    setMessage(adminMessage, error.message);
  }
}

async function removeReservation(reservation) {
  if (!window.confirm(`Annullare l'iscrizione di ${reservation.firstName} ${reservation.lastName}?`)) return;
  try {
    await api(`/api/admin/ministages/${encodeURIComponent(reservation.id)}?type=reservation`, { method: "DELETE" });
    await load();
  } catch (error) {
    setMessage(adminMessage, error.message);
  }
}

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminForm));
  const base = {
    schoolType: values.schoolType,
    title: values.title.trim(),
    description: values.description.trim(),
    location: values.location.trim(),
    capacity: Number(values.capacity),
  };
  const [startDate, startTime] = values.startsAt.split("T");
  const at = (date, time) => new Date(`${date}T${time}`).toISOString();
  const days = [];
  if (editingId || !values.lastDay) {
    days.push(startDate);
  } else {
    for (let day = new Date(`${startDate}T12:00`); day <= new Date(`${values.lastDay}T12:00`); day.setDate(day.getDate() + 1)) {
      if (day.getDay() !== 0 && day.getDay() !== 6) days.push(day.toLocaleDateString("sv-SE"));
    }
    if (days.length === 0 || days.length > 31) {
      setMessage(adminMessage, "Controlla il primo e l'ultimo giorno.");
      return;
    }
  }
  try {
    for (const date of days) {
      const payload = {
        ...base,
        startsAt: at(date, startTime),
        endsAt: values.endTime ? at(date, values.endTime) : null,
      };
      await api(editingId ? `/api/admin/ministages/${encodeURIComponent(editingId)}` : "/api/admin/ministages", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    }
    const wasEditing = Boolean(editingId);
    resetForm();
    await load();
    setMessage(
      adminMessage,
      wasEditing ? "Mini stage aggiornato." : days.length > 1 ? `Aggiunti ${days.length} mini stage.` : "Mini stage aggiunto.",
      "success",
    );
  } catch (error) {
    setMessage(adminMessage, error.message);
  }
});

document.querySelector("#ministage-cancel-edit").addEventListener("click", resetForm);

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
