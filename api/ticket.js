const core = require("../lib/core");
const { methodNotAllowed, vercelHandler } = require("../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "GET" ? core.getTicket(req.query.code) : methodNotAllowed("GET"),
);
