function methodNotAllowed(allowed) {
  return { status: 405, headers: { Allow: allowed }, body: { error: "Metodo non consentito." } };
}

// Adatta un gestore { status, body } alle funzioni Node.js di Vercel.
function vercelHandler(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req);
      res.setHeader("Cache-Control", "no-store");
      for (const [name, value] of Object.entries(result.headers || {})) res.setHeader(name, value);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Non è stato possibile completare la richiesta." });
    }
  };
}

module.exports = { methodNotAllowed, vercelHandler };
