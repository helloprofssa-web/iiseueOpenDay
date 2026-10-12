const TURN_NAMES = { 1: "Primo turno", 2: "Secondo turno" };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

let transporter;

function getTransporter() {
  if (!transporter) {
    const nodemailer = require("nodemailer");
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

// Restituisce true solo se la mail è stata consegnata al server SMTP.
async function sendConfirmationEmail({ email, firstName, code, turn, attendees, ticketUrl, cancelUrl }) {
  const turnName = TURN_NAMES[turn];
  const people = `${attendees} ${attendees === 1 ? "persona" : "persone"}`;
  const text = [
    `Ciao ${firstName},`,
    "",
    "la tua prenotazione per l'Open Day è confermata.",
    "",
    `Codice di prenotazione: ${code}`,
    `Turno: ${turnName}`,
    `Partecipanti: ${people}`,
    "",
    `Il tuo biglietto con QR code (da mostrare all'ingresso): ${ticketUrl}`,
    `Se non puoi venire, annulla la prenotazione qui: ${cancelUrl}`,
  ].join("\n");
  const html = `
    <p>Ciao ${escapeHtml(firstName)},</p>
    <p>la tua prenotazione per l'Open Day è confermata.</p>
    <p>Codice di prenotazione:<br><strong style="font-size:22px;letter-spacing:2px">${escapeHtml(code)}</strong></p>
    <p>Turno: <strong>${turnName}</strong><br>Partecipanti: <strong>${people}</strong></p>
    <p><a href="${escapeHtml(ticketUrl)}">Apri il biglietto con QR code</a> e mostralo all'ingresso.</p>
    <p>Se non puoi venire, <a href="${escapeHtml(cancelUrl)}">annulla la prenotazione</a> per liberare i posti.</p>`;

  if (!isConfigured()) {
    console.warn(`SMTP non configurato: email di conferma non inviata a ${email} (codice ${code}).`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: `Open Day: prenotazione confermata (${code})`,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error("Invio dell'email di conferma non riuscito:", error);
    return false;
  }
}

module.exports = { sendConfirmationEmail };
