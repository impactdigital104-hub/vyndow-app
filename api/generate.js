export default function handler(req, res) {
  if (req.method !== "POST") {
    // For now, guide the user to use POST
    return res.status(200).json({
      ok: true,
      message: "Vyndow SEO /api/generate is live. Please call this endpoint with POST and a JSON body.",
      exampleBody: {
        topic: "How to Support a Loved One Struggling with Drug Dependency",
        primaryKeyword: "support loved one drug dependency",
        secondaryKeywords: [
          "help someone with drug dependency",
          "family support for addiction"
        ],
        wordCount: 1200,
        seoIntent: "informational",
        notes: "Keep the tone gentle, family-focused, and non-medical."
      }
    });
  }

  // In the future, we will:
  // 1) Read the body (blog brief)
  // 2) Call the AI engine with Anatta config + master prompt
  // 3) Return the real 15 outputs
  //
  // For now, we return a dummy, but correctly structured, 15-output bundle.

  // Just echo whatever brief is sent (if any)
  const brief = req.body || {};

  const outputs = {
    output1: "Dummy Output 1: Blog Title Recommendation will appear here.",
    output2: "Dummy Output 2: H1 will appear here.",
    output3: "Dummy Output 3: SEO Title will appear here.",
    output4: "Dummy Output 4: Meta Description will appear here.",
    output5: "Dummy Output 5: URL Slug Suggestion will appear here.",
    output6: "Dummy Output 6: Primary Keyword (echoed from input) will appear here.",
    output7: "Dummy Output 7: Up to 5 Secondary Keywords will appear here.",
    output8: "Dummy Output 8: Full ~Article will appear here.",
    output9: "Dummy Output 9: Internal Links Table will appear here.",
    output10: "Dummy Output 10: 5 FAQs will appear here.",
    output11: "Dummy Output 11: Image Alt Text suggestions will appear here.",
    output12: "Dummy Output 12: Two Image Prompts will appear here.",
    output13: "Dummy Output 13: JSON-LD Schema Markup will appear here.",
    output14: "Dummy Output 14: Readability & Risk Metrics will appear here.",
    output15: "Dummy Output 15: Checklist Verification will appear here."
  };

  res.status(200).json({
    ok: true,
    note: "This is a placeholder 15-output bundle. AI logic will replace these strings later.",
    receivedBrief: brief,
    outputs
  });
}
