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

async function refreshAvailability() {
  try {
    const response = await fetch("/api/availability");
    if (!response.ok) throw new Error("Non è stato possibile caricare i posti disponibili.");
    const { turns } = await response.json();
    for (const turn of turns) {
      document.querySelector(`[data-turn-available="${turn.turn}"]`).textContent = turn.available;
      document.querySelector(`[data-turn-booked="${turn.turn}"]`).textContent = `${turn.booked} / ${turn.capacity}`;
      document.querySelector(`[data-turn-bar="${turn.turn}"]`).style.width = `${turn.booked}%`;
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
      ? "Ti abbiamo inviato una mail di conferma."
      : "Non siamo riusciti a inviarti la mail: salva il codice e il biglietto.";
    showFormMessage(
      `Prenotazione confermata per ${result.attendees} ${result.attendees === 1 ? "persona" : "persone"}. ${emailNote} Conserva il codice:`,
      "success",
      result.code,
      [
        { href: `/ticket?code=${encodeURIComponent(result.code)}`, text: "Apri il biglietto con QR code ↗" },
        { href: `/ticket?code=${encodeURIComponent(result.code)}&print=1`, text: "Stampa la prenotazione ↗" },
      ],
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
window.setInterval(refreshAvailability, 30_000);
