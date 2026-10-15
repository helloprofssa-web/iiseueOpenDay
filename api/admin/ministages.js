const ministage = require("../../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "GET" ? ministage.listAdminMinistages(req.headers) : methodNotAllowed("GET"),
);
