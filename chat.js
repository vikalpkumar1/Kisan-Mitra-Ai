// /api/chat.js
// Vercel serverless function — proxies text requests to Groq so the API key
// never reaches the browser. Requires env var GROQ_API_KEY set in Vercel.

const MODEL = "llama-3.3-70b-versatile"; // fast + solid multilingual Indian-language quality on Groq

function agentSystemPrompt(lang) {
  return (
    "You are 'AI Kisan Agent', a knowledgeable, warm Indian agricultural advisor chatting with a farmer inside a mobile app. " +
    "Always reply entirely in " +
    lang +
    " (use its native script, e.g. Devanagari for Hindi). Use Indian units (acres, quintals, ₹). " +
    "You help with: crop diseases and pests, irrigation, fertilizer/NPK dosage, weather-linked farming decisions, government schemes (PM-KISAN, PMFBY, KCC, Soil Health Card, PM-KUSUM, e-NAM etc.), and market/selling channels. " +
    "Whenever a farmer describes a crop problem (disease/pest symptoms) and asks what medicine or chemical to use, name a specific generic/active-ingredient fungicide, insecticide, or biopesticide commonly used in India for that exact problem (not a brand name), with a typical dose range per liter of water or per acre. " +
    "ALWAYS pair any chemical recommendation with a short safety line: follow the product label exactly, wear gloves and a mask while spraying, respect the pre-harvest interval, keep it away from children and water sources, and confirm exact dosage with the local Krishi Vigyan Kendra (KVK) or agriculture officer since it varies by formulation, crop variety, and region. " +
    "Keep replies under 180 words unless the farmer asks for more detail. Use short lines starting with '- ' for actionable points and **bold** only for the 2-3 most important terms. No markdown headers. " +
    "Never invent exact scheme amounts, live prices, or lab results you're unsure of — say to verify locally instead. If a question is genuinely unclear, ask one short clarifying question instead of guessing."
  );
}

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

    default:
      return null;
  }
}

// Builds the final `messages` array sent to Groq. 'agent' mode gets proper
// multi-turn history (system + prior turns + new question); all other modes
// stay single-shot for simplicity and lower token cost.
function buildMessages(mode, payload) {
  if (mode === "agent") {
    const sys = { role: "system", content: agentSystemPrompt(payload.lang || "Hindi") };
    const history = (payload.history || [])
      .slice(-10)
      .map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text }));
    return [sys, ...history, { role: "user", content: payload.question || "" }];
  }
  const prompt = buildPrompt(mode, payload);
  if (!prompt) return null;
  return [{ role: "user", content: prompt }];
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const { mode, payload } = req.body || {};
    const messages = buildMessages(mode, payload || {});
    if (!messages) return res.status(400).json({ error: "invalid_mode" });

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
        messages,
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

