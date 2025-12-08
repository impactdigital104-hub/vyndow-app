export default function handler(req, res) {
  // For now, this is just a test endpoint.
  // Later, we will add the real AI call here.
  res.status(200).json({
    ok: true,
    method: req.method,
    message: "Vyndow SEO /api/generate endpoint is live and working.",
    note: "This is a placeholder response. The AI logic will be added next."
  });
}
