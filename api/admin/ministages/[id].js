const ministage = require("../../../lib/ministage");
const { methodNotAllowed, vercelHandler } = require("../../../lib/vercel");

// Con ?type=reservation l'id indica un'iscrizione invece di un mini stage.
module.exports = vercelHandler((req) => {
  const isReservation = req.query.type === "reservation";
  if (req.method === "DELETE" && isReservation) return ministage.deleteMinistageReservation(req.headers, req.query.id);
  if (req.method === "DELETE") return ministage.deleteMinistage(req.headers, req.query.id);
  if (req.method === "PUT" && !isReservation) return ministage.updateMinistage(req.headers, req.query.id, req.body);
  return methodNotAllowed("PUT, DELETE");
});
