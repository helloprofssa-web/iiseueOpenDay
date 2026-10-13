const loginPanel = document.querySelector("#checkin-login-panel");
const loginForm = document.querySelector("#checkin-login-form");
const loginMessage = document.querySelector("#checkin-login-message");
const panel = document.querySelector("#checkin-panel");
const keyStorageName = "open-day-checkin-key";
let checkinKey = "";

const verifyForm = document.querySelector("#verify-form");
const verifyResult = document.querySelector("#verify-result");
const scanVideo = document.querySelector("#scan-video");
const scanToggle = document.querySelector("#scan-toggle");
let scanStream = null;
let scanTimer = null;
let verifying = false;

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

function showVerifyResult(kind, title, details = "") {
  verifyResult.replaceChildren();
  verifyResult.className = `verify-result ${kind}`;
  const heading = document.createElement("strong");
  heading.textContent = title;
  verifyResult.append(heading);
  if (details) {
    const text = document.createElement("span");
    text.textContent = details;
    verifyResult.append(text);
  }
  verifyResult.hidden = false;
}

function postCheckIn(code) {
  return fetch("/api/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-checkin-key": checkinKey },
    body: JSON.stringify({ code }),
  });
}

function logout() {
  stopScanning();
  sessionStorage.removeItem(keyStorageName);
  checkinKey = "";
  panel.hidden = true;
  loginPanel.hidden = false;
}

async function verifyCode(rawValue) {
  const match = String(rawValue).toUpperCase().match(/[A-F0-9]{10}/);
  if (!match) return showVerifyResult("invalid", "QR code non valido", "Il contenuto non è un codice di prenotazione.");
  verifying = true;
  try {
    const response = await postCheckIn(match[0]);
    const result = await response.json();
    if (response.status === 401 || response.status === 503) {
      logout();
      return setMessage(loginMessage, result.error);
    }
    if (response.status === 404) return showVerifyResult("invalid", "Prenotazione non valida", result.error);
    if (!response.ok) throw new Error(result.error || "Verifica non riuscita.");
    const { reservation } = result;
    const who = `${reservation.firstName} ${reservation.lastName} · ${reservation.school} · ` +
      `${reservation.turn === 1 ? "Primo turno" : "Secondo turno"} · ${reservation.attendees} ` +
      `${reservation.attendees === 1 ? "persona" : "persone"}`;
    if (result.alreadyCheckedIn) {
      showVerifyResult("warning", "Già entrato", `${who}. Ingresso registrato alle ${formatDate(reservation.checkedInAt)}.`);
    } else {
      showVerifyResult("valid", "Prenotazione valida", who);
    }
  } catch (error) {
    showVerifyResult("invalid", "Errore", error.message);
  } finally {
    verifying = false;
  }
}

function stopScanning() {
  window.clearInterval(scanTimer);
  scanTimer = null;
  if (scanStream) scanStream.getTracks().forEach((track) => track.stop());
  scanStream = null;
  scanVideo.hidden = true;
  scanToggle.textContent = "Scansiona con la fotocamera";
}

async function startScanning() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showVerifyResult("warning", "Fotocamera non disponibile", "La fotocamera richiede una connessione sicura (https): inserisci il codice a mano.");
    return;
  }
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const nativeDetector = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
    const detect = async () => {
      if (nativeDetector) {
        const codes = await nativeDetector.detect(scanVideo).catch(() => []);
        if (codes.length > 0) return codes[0].rawValue;
      }
      if (!window.jsQR || !scanVideo.videoWidth) return null;
      canvas.width = scanVideo.videoWidth;
      canvas.height = scanVideo.videoHeight;
      context.drawImage(scanVideo, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(image.data, image.width, image.height)?.data || null;
    };
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    scanVideo.srcObject = scanStream;
    scanVideo.hidden = false;
    await scanVideo.play();
    scanToggle.textContent = "Ferma la fotocamera";
    scanTimer = window.setInterval(async () => {
      if (verifying) return;
      const value = await detect();
      if (value) {
        stopScanning();
        verifyCode(value);
      }
    }, 400);
  } catch (error) {
    stopScanning();
    showVerifyResult("warning", "Fotocamera non disponibile", `Consenti l'accesso alla fotocamera oppure inserisci il codice a mano. (${error.name || "errore"})`);
  }
}

// Un codice vuoto non registra nulla: risponde 404 se la password è corretta, 401 altrimenti.
async function login(key) {
  checkinKey = key;
  const response = await postCheckIn("");
  if (response.status === 401 || response.status === 503) {
    checkinKey = "";
    const result = await response.json();
    throw new Error(result.error || "Accesso non riuscito.");
  }
  sessionStorage.setItem(keyStorageName, key);
  loginPanel.hidden = true;
  panel.hidden = false;
  setMessage(loginMessage, "");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login(loginForm.elements.key.value);
    loginForm.reset();
  } catch (error) {
    setMessage(loginMessage, error.message);
  }
});

document.querySelector("#checkin-logout").addEventListener("click", logout);
scanToggle.addEventListener("click", () => (scanStream ? stopScanning() : startScanning()));
verifyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  verifyCode(verifyForm.elements.code.value);
  verifyForm.reset();
});

const savedKey = sessionStorage.getItem(keyStorageName);
if (savedKey) login(savedKey).catch((error) => setMessage(loginMessage, error.message));
