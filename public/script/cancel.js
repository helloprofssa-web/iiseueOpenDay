const form = document.querySelector("#cancel-form");
const message = document.querySelector("#cancel-message");

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type}`;
  message.hidden = false;
}

const codeFromLink = new URLSearchParams(window.location.search).get("code");
if (codeFromLink) form.elements.code.value = codeFromLink.toUpperCase();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!window.confirm("Vuoi davvero annullare la prenotazione? L'operazione non si può annullare.")) return;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  message.hidden = true;
  try {
    const response = await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: form.elements.code.value, email: form.elements.email.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Non è stato possibile annullare la prenotazione.");
    form.reset();
    showMessage("Prenotazione annullata: i posti sono di nuovo disponibili. Grazie per averci avvisato!", "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});
