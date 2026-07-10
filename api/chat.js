// /api/chat.js
// Vercel serverless function — proxies text requests to Groq so the API key
// never reaches the browser. Requires env var GROQ_API_KEY set in Vercel.

const MODEL = "llama-3.3-70b-versatile"; // fast + solid multilingual Indian-language quality on Groq

function buildPrompt(mode, payload) {
  const common =
    "You are 'Kisan Mitra', a warm, practical Indian agricultural extension expert. " +
    "Always answer entirely in the requested language (including using its native script, e.g. Devanagari for Hindi). " +
    "Use Indian units (acres, quintals, ₹). Keep the answer under 220 words. " +
    "Format as short lines starting with '- ' for actionable points, and use **bold** only for the 2-3 most important terms. " +
    "Do not use markdown headers (#). Be specific and actionable, not generic. Never invent exact prices, scheme amounts, or lab results you are not certain of — say to verify locally if unsure.";

  switch (mode) {
    case "irrigation":
      return `${common}\n\nTask: Give an irrigation schedule recommendation.\nCrop: ${payload.crop}\nSoil type: ${payload.soil}\nGrowth stage: ${payload.stage}\nLast watered: ${payload.lastWatered}\nLand size: ${payload.land}\nUpcoming rain forecast data: ${payload.weatherNote}\nRespond in: ${payload.lang}.\nCover: whether to irrigate now or wait, how much water roughly, and one water-saving tip (like mulching or drip) relevant to this crop.`;

    case "fertilizer":
      return `${common}\n\nTask: Give a fertilizer recommendation.\nCrop: ${payload.crop}\nGrowth stage: ${payload.stage}\nSoil type: ${payload.soil}\nLand size: ${payload.land}\nPreference: ${payload.pref}\nRespond in: ${payload.lang}.\nCover: which nutrients (N-P-K) are typically needed at this stage, rough dosage per acre as a general guideline, organic alternatives if relevant, and a reminder that a free Soil Health Card test gives exact dosage.`;

    case "price_estimate":
      return `${common}\n\nTask: Give a general, honest wholesale price RANGE estimate (not a live quote) for a crop in a given Indian state, based on typical seasonal patterns you're aware of.\nCrop: ${payload.crop}\nState: ${payload.state}\nMandi (if given): ${payload.mandi}\nRespond in English mixed with simple Hindi terms is fine.\nClearly state this is an approximate/general estimate, not today's live mandi rate, and that actual prices vary by mandi, quality/grade, and season. Suggest checking Agmarknet or e-NAM for today's exact rate.`;

    case "buyer_tips":
      return `${common}\n\nTask: Suggest safe, legitimate selling channels for a farmer's produce — do NOT invent specific trader names, phone numbers, or company names since that could be fraudulent or unverifiable.\nCrop: ${payload.crop}\nLocation: ${payload.place}\nRespond in simple Hindi/English mix.\nCover: local mandi/APMC, e-NAM online trading, FPO (Farmer Producer Organisation) aggregation for better bargaining power, and contract farming via registered companies — mention these as categories/channels, not specific businesses.`;

    case "voice":
      return `${common}\n\nYou are having a friendly spoken conversation with a farmer. They just asked (transcribed from voice, may have minor recognition errors):\n"${payload.question}"\nRespond in: ${payload.lang}.\nKeep it conversational, warm, and shorter than usual (under 120 words) since it will be read aloud by text-to-speech. If the question is unclear or seems like a speech-recognition error, gently ask them to repeat it.`;

    default:
      return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const { mode, payload } = req.body || {};
    const prompt = buildPrompt(mode, payload || {});
    if (!prompt) return res.status(400).json({ error: "invalid_mode" });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "missing_api_key" });

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_completion_tokens: 500,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq error:", errText);
      return res.status(502).json({ error: "groq_error" });
    }

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error" });
  }
};
