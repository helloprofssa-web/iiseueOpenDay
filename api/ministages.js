const ministage = require("../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../lib/vercel");

module.exports = vercelHandler((req) => {
  if (req.method === "GET") return ministage.listPublicMinistages(req.query && req.query.school);
  if (req.method === "POST") return ministage.createMinistageReservation(req.body);
  return methodNotAllowed("GET, POST");
});
