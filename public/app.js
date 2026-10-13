const bookingForm = document.querySelector("#booking-form");
const formMessage = document.querySelector("#form-message");

function showFormMessage(message, type = "error", code = "", link = null) {
  formMessage.replaceChildren();
  formMessage.className = `form-message ${type}`;
  const text = document.createElement("span");
  text.textContent = message;
  formMessage.append(text);
  if (code) {
    const codeLabel = document.createElement("strong");
    codeLabel.className = "booking-code";
    codeLabel.textContent = code;
    formMessage.append(codeLabel);
  }
  if (link) {
    for (const item of [].concat(link)) {
      const anchor = document.createElement("a");
      anchor.className = "message-link";
      anchor.href = item.href;
      anchor.textContent = item.text;
      formMessage.append(anchor);
    }
  }
  formMessage.hidden = false;
}

let deadlineMs = null;
let clockOffset = 0;
const countdownSection = document.querySelector("#countdown");

function closeRegistrations() {
  countdownSection.classList.add("is-closed");
  document.querySelector("#countdown-title").textContent = "Iscrizioni chiuse";
  document.querySelector("#countdown-note")?.replaceChildren("Il termine per prenotare era il 4 novembre.");
  for (const el of document.querySelectorAll("[data-cd]")) el.textContent = "00";
  for (const el of bookingForm.elements) el.disabled = true;
}

function tickCountdown() {
  if (deadlineMs === null) return;
  const left = deadlineMs - (Date.now() + clockOffset);
  if (left <= 0) return closeRegistrations();
  const parts = {
    days: Math.floor(left / 86_400_000),
    hours: Math.floor(left / 3_600_000) % 24,
    minutes: Math.floor(left / 60_000) % 60,
    seconds: Math.floor(left / 1000) % 60,
  };
  for (const [key, value] of Object.entries(parts)) {
    const el = document.querySelector(`[data-cd="${key}"]`);
    const text = String(value).padStart(2, "0");
    if (el.textContent !== text) el.textContent = text;
  }
  countdownSection.classList.toggle("is-urgent", left < 3 * 86_400_000);
  const note = document.querySelector("#countdown-note");
  if (left < 86_400_000 && note) note.textContent = "Ultime ore per iscriversi!";
}

async function refreshAvailability() {
  try {
    const response = await fetch("/api/availability");
    if (!response.ok) throw new Error("Non è stato possibile caricare i posti disponibili.");
    const { turns, deadline, now } = await response.json();
    if (deadline) {
      deadlineMs = new Date(deadline).getTime();
      clockOffset = new Date(now).getTime() - Date.now();
      tickCountdown();
    }
    for (const turn of turns) {
      document.querySelector(`[data-turn-available="${turn.turn}"]`).textContent = turn.available;
      document.querySelector(`[data-turn-booked="${turn.turn}"]`).textContent = `${turn.booked} / ${turn.capacity}`;
      document.querySelector(`[data-turn-bar="${turn.turn}"]`).style.width = `${Math.min(100, (turn.booked / turn.capacity) * 100)}%`;
      document.querySelectorAll("[data-capacity]").forEach((element) => (element.textContent = turn.capacity));
      document.querySelector(`[data-turn-status="${turn.turn}"]`).textContent =
        turn.available === 0 ? "Posti esauriti" : "Prenotazioni aperte";
      document.querySelector(`[data-turn-card="${turn.turn}"]`).classList.toggle("is-full", turn.available === 0);
      const option = bookingForm.elements.turn.querySelector(`option[value="${turn.turn}"]`);
      option.disabled = turn.available === 0;
      option.textContent = turn.available === 0
        ? `${turn.turn === 1 ? "Primo" : "Secondo"} turno — posti esauriti`
        : `${turn.turn === 1 ? "Primo" : "Secondo"} turno`;
    }
  } catch (error) {
    showFormMessage(error.message);
  }
}

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = bookingForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  formMessage.hidden = true;
  const values = new FormData(bookingForm);
  const payload = {
    firstName: values.get("firstName"),
    lastName: values.get("lastName"),
    school: values.get("school"),
    email: values.get("email"),
    program: values.get("program"),
    turn: values.get("turn"),
    attendees: values.get("attendees"),
  };

  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Non è stato possibile completare la prenotazione.");
    bookingForm.reset();
    const emailNote = result.emailSent
      ? "Ti abbiamo inviato una mail di conferma: il biglietto con QR code arriverà via email alla chiusura delle iscrizioni."
      : "Non siamo riusciti a inviarti la mail: salva il codice. Il biglietto ti sarà inviato alla chiusura delle iscrizioni.";
    showFormMessage(
      `Prenotazione confermata per ${result.attendees} ${result.attendees === 1 ? "persona" : "persone"}. ${emailNote} Conserva il codice:`,
      "success",
      result.code,
    );
    await refreshAvailability();
    formMessage.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showFormMessage(error.message);
    if (error.message.includes("posti disponibili")) await refreshAvailability();
  } finally {
    submitButton.disabled = false;
  }
});

refreshAvailability();
window.setInterval(tickCountdown, 1000);
window.setInterval(refreshAvailability, 30_000);
