const core = require("../lib/core");
const { methodNotAllowed, vercelHandler } = require("../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "GET" ? core.getAvailability(req.query && req.query.school) : methodNotAllowed("GET"),
);
