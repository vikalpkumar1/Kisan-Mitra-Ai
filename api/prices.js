// /api/prices.js
// Vercel serverless function — tries to fetch LIVE mandi prices from the
// Government of India's open data portal (data.gov.in / Agmarknet dataset).
// This is fully optional: if AGMARK_API_KEY is not set, or the lookup fails
// or returns no rows, it responds with {source:"fallback"} and the frontend
// automatically falls back to an AI-generated estimate instead. Nothing breaks
// either way.
//
// To enable live prices:
// 1. Get a free API key at https://data.gov.in (register, then "My Account" -> API keys)
// 2. Add it to Vercel as env var AGMARK_API_KEY
// 3. The RESOURCE_ID below points to the "Variety-wise Daily Market Prices"
//    dataset. Government resource IDs occasionally change — if you get zero
//    results even for common crops like "Wheat" + "Uttar Pradesh", check
//    https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
//    for the current resource ID and swap it in below.

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";

module.exports = async (req, res) => {
  const { crop, state, mandi } = req.query || {};
  const apiKey = process.env.AGMARK_API_KEY;

  if (!apiKey || !crop || !state) {
    return res.status(200).json({ source: "fallback" });
  }

  try {
    let url =
      `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${apiKey}` +
      `&format=json&limit=20` +
      `&filters[commodity]=${encodeURIComponent(crop)}` +
      `&filters[state]=${encodeURIComponent(state)}`;
    if (mandi) url += `&filters[market]=${encodeURIComponent(mandi)}`;

    const r = await fetch(url);
    if (!r.ok) return res.status(200).json({ source: "fallback" });

    const data = await r.json();
    const records = (data.records || []).map((rec) => ({
      market: rec.market || rec.Market || "—",
      variety: rec.variety || rec.Variety || "",
      min_price: rec.min_price || rec.Min_Price || "?",
      max_price: rec.max_price || rec.Max_Price || "?",
      modal_price: rec.modal_price || rec.Modal_Price || "?",
      arrival_date: rec.arrival_date || rec.Arrival_Date || "",
    }));

    if (!records.length) return res.status(200).json({ source: "fallback" });
    return res.status(200).json({ source: "live", records });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ source: "fallback" });
  }
};
