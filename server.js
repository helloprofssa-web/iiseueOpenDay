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
  ["/admin.html", ["admin.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

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
  if (request.method === "POST" && url.pathname === "/api/reservations") {
    let data;
    try {
      data = await readJson(request);
    } catch (error) {
      return { status: error.statusCode || 400, body: { error: error.message } };
    }
    return core.createReservation(data);
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
  response.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'");
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    const result = await route(request, url);
    if (result) return sendJson(response, result);

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
