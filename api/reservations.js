const core = require("../lib/core");
const { methodNotAllowed, vercelHandler, getBaseUrl } = require("../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "POST" ? core.createReservation(req.body, getBaseUrl(req)) : methodNotAllowed("POST"),
);
