const core = require("../../lib/core");
const { methodNotAllowed, vercelHandler } = require("../../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "GET" ? core.listReservations(req.headers) : methodNotAllowed("GET"),
);
