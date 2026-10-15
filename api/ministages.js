const ministage = require("../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "GET" ? ministage.listPublicMinistages(req.query && req.query.school) : methodNotAllowed("GET"),
);
