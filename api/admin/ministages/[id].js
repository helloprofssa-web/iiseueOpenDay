const ministage = require("../../../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../../../lib/vercel");

module.exports = vercelHandler((req) => {
  if (req.method === "PUT") return ministage.updateMinistage(req.headers, req.query.id, req.body);
  if (req.method === "DELETE") return ministage.deleteMinistage(req.headers, req.query.id);
  return methodNotAllowed("PUT, DELETE");
});
