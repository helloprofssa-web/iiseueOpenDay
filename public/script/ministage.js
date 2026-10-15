const params = new URLSearchParams(window.location.search);
const school = params.get("school") === "tecnico" ? "tecnico" : "liceo";
const schoolLabel = school === "tecnico" ? "Istituto Tecnico" : "Liceo Scientifico";
const form = document.querySelector("#ministage-form");
const list = document.querySelector("#ministage-list");
const pageMessage = document.querySelector("#ministage-message");
const formMessage = document.querySelector("#ministage-message-form");
for (const group of document.querySelectorAll("[data-programs]")) {
  const active = group.dataset.programs === school;
  group.hidden = !active;
  for (const input of group.querySelectorAll("input")) input.disabled = !active;
}

const logo = document.querySelector("#ministage-logo");
logo.src = school === "tecnico" ? "/img/TecnicoLogo.png" : "/img/LiceoLogo.png";
logo.alt = `Logo ${schoolLabel}`;
logo.hidden = false;
document.querySelector("#ministage-school").textContent = `Mini stage ${schoolLabel}`;
document.querySelector("#back-link").href = `/${school}`;
document.title = `Mini stage ${schoolLabel} · Open Day`;

function showMessage(element, text, type, code = "") {
  element.replaceChildren(document.createTextNode(text));
  if (code) {
    const strong = document.createElement("strong");
    strong.className = "booking-code";
    strong.textContent = code;
    element.append(strong);
  }
  element.className = `form-message ${type}`;
  element.hidden = false;
}

function formatDate(value, endsAt) {
  const day = new Intl.DateTimeFormat("it-IT", { dateStyle: "full" }).format(new Date(value));
  const time = (v) => new Intl.DateTimeFormat("it-IT", { timeStyle: "short" }).format(new Date(v));
  return endsAt ? `${day}, ore ${time(value)} - ${time(endsAt)}` : `${day}, ore ${time(value)}`;
}

function renderMinistages(ministages) {
  const selected = form.elements.ministageId?.value;
  list.replaceChildren();
  document.querySelector("#ministage-empty").hidden = ministages.length > 0;
  form.hidden = ministages.length === 0;
  for (const item of ministages) {
    const card = document.createElement("label");
    card.className = "choice-card";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "ministageId";
    input.value = item.id;
    input.required = true;
    input.disabled = item.available <= 0;
    input.checked = item.id === selected;
    const indicator = document.createElement("span");
    indicator.className = "choice-indicator";
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = item.title;
    text.append(title);
    const details = [formatDate(item.startsAt, item.endsAt), item.location, item.description].filter(Boolean);
    for (const detail of details) {
      const small = document.createElement("small");
      small.textContent = detail;
      text.append(small);
    }
    const seats = document.createElement("small");
    seats.textContent = item.available <= 0 ? "Posti esauriti" : `${item.available} posti disponibili`;
    text.append(seats);
    card.append(input, indicator, text);
    list.append(card);
  }
}

async function loadMinistages() {
  try {
    const response = await fetch(`/api/ministages?school=${school}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i mini stage.");
    renderMinistages(result.ministages);
  } catch (error) {
    showMessage(pageMessage, error.message, "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  formMessage.hidden = true;
  const values = new FormData(form);
  try {
    const response = await fetch("/api/ministages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(values)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Non è stato possibile completare l'iscrizione.");
    form.reset();
    showMessage(formMessage, `Iscrizione confermata a "${result.title}". Conserva il codice:`, "success", result.code);
    formMessage.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showMessage(formMessage, error.message, "error");
  } finally {
    button.disabled = false;
    await loadMinistages();
  }
});

loadMinistages();
