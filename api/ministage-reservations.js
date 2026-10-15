const ministage = require("../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../lib/vercel");

module.exports = vercelHandler((req) =>
  req.method === "POST" ? ministage.createMinistageReservation(req.body) : methodNotAllowed("POST"),
);
