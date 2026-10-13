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

async function deliver({ email, subject, text, html, logLabel }) {
  if (!isConfigured()) {
    console.warn(`SMTP non configurato: ${logLabel} non inviata a ${email}.`);
    return false;
  }
  try {
    await getTransporter().sendMail({ from: process.env.MAIL_FROM, to: email, subject, text, html });
    return true;
  } catch (error) {
    console.error(`Invio dell'email (${logLabel}) non riuscito:`, error);
    return false;
  }
}

// Restituisce true solo se la mail è stata consegnata al server SMTP.
// Alla prenotazione non si invia il biglietto: arriva a iscrizioni chiuse (sendTicketEmail).
async function sendConfirmationEmail({ email, firstName, code, turn, attendees, cancelUrl, ticketDate }) {
  const turnName = TURN_NAMES[turn];
  const people = `${attendees} ${attendees === 1 ? "persona" : "persone"}`;
  const ticketNote = `Il biglietto con QR code ti sarà inviato via email${ticketDate ? ` dopo il ${ticketDate}` : " alla chiusura delle iscrizioni"}.`;
  const text = [
    `Ciao ${firstName},`,
    "",
    "la tua prenotazione per l'Open Day è confermata.",
    "",
    `Codice di prenotazione: ${code}`,
    `Turno: ${turnName}`,
    `Partecipanti: ${people}`,
    "",
    ticketNote,
    `Se non puoi venire, annulla la prenotazione qui: ${cancelUrl}`,
  ].join("\n");
  const html = `
    <p>Ciao ${escapeHtml(firstName)},</p>
    <p>la tua prenotazione per l'Open Day è confermata.</p>
    <p>Codice di prenotazione:<br><strong style="font-size:22px;letter-spacing:2px">${escapeHtml(code)}</strong></p>
    <p>Turno: <strong>${turnName}</strong><br>Partecipanti: <strong>${people}</strong></p>
    <p>${escapeHtml(ticketNote)}</p>
    <p>Se non puoi venire, <a href="${escapeHtml(cancelUrl)}">annulla la prenotazione</a> per liberare i posti.</p>`;
  return deliver({
    email, subject: `Open Day: prenotazione confermata (${code})`, text, html, logLabel: `conferma (codice ${code})`,
  });
}

async function sendTicketEmail({ email, firstName, code, turn, attendees, ticketUrl, cancelUrl }) {
  const turnName = TURN_NAMES[turn];
  const people = `${attendees} ${attendees === 1 ? "persona" : "persone"}`;
  const text = [
    `Ciao ${firstName},`,
    "",
    "le iscrizioni all'Open Day sono chiuse: ecco il tuo biglietto di ingresso.",
    "",
    `Codice di prenotazione: ${code}`,
    `Turno: ${turnName}`,
    `Partecipanti: ${people}`,
    "",
    `Biglietto con QR code (da mostrare all'ingresso): ${ticketUrl}`,
    `Per stamparlo: ${ticketUrl}&print=1`,
    `Se non puoi più venire, annulla la prenotazione qui: ${cancelUrl}`,
  ].join("\n");
  const html = `
    <p>Ciao ${escapeHtml(firstName)},</p>
    <p>le iscrizioni all'Open Day sono chiuse: ecco il tuo biglietto di ingresso.</p>
    <p>Codice di prenotazione:<br><strong style="font-size:22px;letter-spacing:2px">${escapeHtml(code)}</strong></p>
    <p>Turno: <strong>${turnName}</strong><br>Partecipanti: <strong>${people}</strong></p>
    <p><a href="${escapeHtml(ticketUrl)}">Apri il biglietto con QR code</a> e mostralo all'ingresso, oppure <a href="${escapeHtml(ticketUrl)}&amp;print=1">stampalo</a>.</p>
    <p>Se non puoi più venire, <a href="${escapeHtml(cancelUrl)}">annulla la prenotazione</a> per liberare i posti.</p>`;
  return deliver({
    email, subject: `Open Day: il tuo biglietto (${code})`, text, html, logLabel: `biglietto (codice ${code})`,
  });
}

module.exports = { sendConfirmationEmail, sendTicketEmail };
