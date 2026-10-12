const code = new URLSearchParams(window.location.search).get("code") || "";
const errorBox = document.querySelector("#ticket-error");

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = false;
}

async function loadTicket() {
  if (!code) return showError("Codice mancante: apri il link ricevuto per email.");
  try {
    const response = await fetch(`/api/ticket?code=${encodeURIComponent(code)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare il biglietto.");
    const { ticket, qr } = result;
    document.querySelector("#ticket-name").textContent = `${ticket.firstName} ${ticket.lastName}`;
    document.querySelector("#ticket-school").textContent = ticket.school;
    document.querySelector("#ticket-qr").src = qr;
    document.querySelector("#ticket-code").textContent = ticket.code;
    document.querySelector("#ticket-turn").textContent = ticket.turn === 1 ? "Primo turno" : "Secondo turno";
    document.querySelector("#ticket-attendees").textContent = String(ticket.attendees);
    document.querySelector("#ticket-program").textContent =
      ticket.program === "tradizionale" ? "Scientifico tradizionale" : "Scienze applicate";
    document.querySelector("#ticket").hidden = false;
    if (new URLSearchParams(window.location.search).has("print")) {
      const image = document.querySelector("#ticket-qr");
      await image.decode().catch(() => {});
      window.print();
    }
  } catch (error) {
    showError(error.message);
  }
}

document.querySelector("#print-ticket").addEventListener("click", () => window.print());
loadTicket();
