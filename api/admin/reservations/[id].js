const core = require("../../../lib/core");
const { methodNotAllowed, vercelHandler } = require("../../../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "DELETE" ? core.deleteReservation(req.headers, req.query.id) : methodNotAllowed("DELETE"),
);
