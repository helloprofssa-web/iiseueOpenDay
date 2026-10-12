const core = require("../../lib/core");
const { methodNotAllowed, vercelHandler } = require("../../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "POST" ? core.checkIn(req.headers, req.body) : methodNotAllowed("POST"),
);
