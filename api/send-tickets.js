const core = require("../lib/core");
const { methodNotAllowed, vercelHandler, getBaseUrl } = require("../lib/vercel");

// Il cron di Vercel chiama questo endpoint con GET; l'amministratore lo usa con POST.
module.exports = vercelHandler((req) =>
  req.method === "GET" || req.method === "POST"
    ? core.sendTickets(req.headers, getBaseUrl(req))
    : methodNotAllowed("GET, POST"),
);
