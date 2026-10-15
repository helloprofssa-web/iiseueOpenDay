const ministage = require("../../../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../../../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "DELETE" ? ministage.deleteMinistageReservation(req.headers, req.query.id) : methodNotAllowed("DELETE"),
);
