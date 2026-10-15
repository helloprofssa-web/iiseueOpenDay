const ministage = require("../../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../../lib/vercel");

module.exports = vercelHandler((req) => {
  if (req.method === "GET") return ministage.listAdminMinistages(req.headers);
  if (req.method === "POST") return ministage.createMinistage(req.headers, req.body);
  return methodNotAllowed("GET, POST");
});
