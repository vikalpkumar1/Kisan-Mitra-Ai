// /api/vision.js
// Vercel serverless function — proxies image analysis to Groq's vision model.
// Requires env var GROQ_API_KEY set in Vercel.
//
// NOTE ON MODEL NAME: Groq occasionally rotates/deprecates vision model IDs.
// As of writing, "meta-llama/llama-4-scout-17b-16e-instruct" is listed as a
// supported vision model at https://console.groq.com/docs/vision alongside
// "qwen/qwen3.6-27b". If this model ever starts returning errors, swap
// MODEL below to "qwen/qwen3.6-27b" or whatever is current on that page.

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const FALLBACK_MODEL = "qwen/qwen3.6-27b";

function buildPrompt(lang) {
  return (
    "You are an expert plant pathologist and entomologist helping an Indian farmer via a photo. " +
    "Look carefully at the crop/leaf/stem/fruit in this image and answer entirely in " +
    lang +
    " (use the native script, e.g. Devanagari for Hindi). " +
    "If the image does not clearly show a plant or is too unclear to assess, say so honestly instead of guessing. " +
    "Otherwise cover, briefly: " +
    "1) most likely disease name (if any) and its cause (fungal/bacterial/viral/nutrient deficiency), " +
    "2) any visible pest or insect damage and the likely pest, " +
    "3) severity as mild, moderate, or severe, " +
    "4) 2-3 organic/cultural treatment steps, " +
    "5) 1-2 chemical treatment categories (generic, not brand names) with a reminder to follow label instructions and consult a local Krishi Vigyan Kendra (KVK) for severe cases, " +
    "6) one prevention tip for next season. " +
    "Format as short lines starting with '- ', use **bold** only for the disease/pest name, no markdown headers, under 260 words total."
  );
}

async function callGroqVision(apiKey, model, imageDataUrl, prompt) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.3,
      max_completion_tokens: 500,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const { image, lang } = req.body || {};
    if (!image) return res.status(400).json({ error: "missing_image" });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "missing_api_key" });

    const prompt = buildPrompt(lang || "Hindi");

    let groqRes = await callGroqVision(apiKey, MODEL, image, prompt);
    if (!groqRes.ok) {
      // try fallback vision model once
      groqRes = await callGroqVision(apiKey, FALLBACK_MODEL, image, prompt);
    }

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq vision error:", errText);
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
