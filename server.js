// Server locale per sviluppo e test: usa gli stessi gestori delle funzioni Vercel.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const core = require("./lib/core");

const PORT = Number(process.env.PORT || 3000);
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/admin", ["admin.html", "text/html; charset=utf-8"]],
  ["/checkin", ["checkin.html", "text/html; charset=utf-8"]],
  ["/admin.html", ["admin.html", "text/html; charset=utf-8"]],
  ["/cancel", ["cancel.html", "text/html; charset=utf-8"]],
  ["/ticket", ["ticket.html", "text/html; charset=utf-8"]],
  ["/cancel.js", ["cancel.js", "text/javascript; charset=utf-8"]],
  ["/ticket.js", ["ticket.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]],
  ["/jsqr.js", ["jsqr.js", "text/javascript; charset=utf-8"]],
  ["/xlsx.js", ["xlsx.js", "text/javascript; charset=utf-8"]],
  ["/checkin.js", ["checkin.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

const imageTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };

function sendJson(response, result) {
  response.writeHead(result.status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(result.body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (body.length + chunk.length > 10_000) tooLarge = true;
      else if (!tooLarge) body += chunk;
    });
    request.on("end", () => {
      if (tooLarge) return reject(Object.assign(new Error("Richiesta troppo grande."), { statusCode: 413 }));
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("La richiesta non contiene JSON valido."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function route(request, url) {
  if (request.method === "GET" && url.pathname === "/api/availability") return core.getAvailability();
  if (request.method === "GET" && url.pathname === "/api/ticket") {
    return core.getTicket(url.searchParams.get("code"));
  }
  if (request.method === "POST" && ["/api/reservations", "/api/cancel", "/api/checkin"].includes(url.pathname)) {
    let data;
    try {
      data = await readJson(request);
    } catch (error) {
      return { status: error.statusCode || 400, body: { error: error.message } };
    }
    if (url.pathname === "/api/cancel") return core.cancelReservation(data);
    if (url.pathname === "/api/checkin") return core.checkIn(request.headers, data);
    const baseUrl = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/+$/, "")
      : `http://${request.headers.host}`;
    return core.createReservation(data, baseUrl);
  }
  if (request.method === "GET" && url.pathname === "/api/admin/reservations") {
    return core.listReservations(request.headers);
  }
  const deleteMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)$/);
  if (request.method === "DELETE" && deleteMatch) {
    return core.deleteReservation(request.headers, decodeURIComponent(deleteMatch[1]));
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    const result = await route(request, url);
    if (result) return sendJson(response, result);

    if (request.method === "GET" && /^\/fonts\/[a-z0-9-]+\.woff2$/.test(url.pathname)) {
      const content = await fs.readFile(path.join(__dirname, "public", url.pathname));
      response.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=86400" });
      return response.end(content);
    }

    if (request.method === "GET" && /^\/img\/[A-Za-z0-9_-]+\.(png|jpe?g|svg|webp)$/.test(url.pathname)) {
      const content = await fs.readFile(path.join(__dirname, "public", url.pathname));
      response.writeHead(200, { "Content-Type": imageTypes[path.extname(url.pathname)], "Cache-Control": "no-cache" });
      return response.end(content);
    }

    if (request.method === "GET" && staticFiles.has(url.pathname)) {
      const [fileName, contentType] = staticFiles.get(url.pathname);
      const content = await fs.readFile(path.join(__dirname, "public", fileName));
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
      return response.end(content);
    }
    sendJson(response, { status: 404, body: { error: "Pagina o risorsa non trovata." } });
  } catch (error) {
    console.error(error);
    sendJson(response, { status: 500, body: { error: "Non è stato possibile completare la richiesta." } });
  }
});

server.listen(PORT, () => {
  console.log(`Open Day disponibile su http://localhost:${server.address().port}`);
  if (!process.env.OPEN_DAY_ADMIN_KEY) {
    console.warn("Imposta OPEN_DAY_ADMIN_KEY per abilitare l'accesso amministratore.");
  }
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
