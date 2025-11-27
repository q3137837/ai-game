import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

app.get("/api/config", async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const config = {
      defaultModel: process.env.AI_DEFAULT_MODEL || "DeepSeek-R1-0528",
      apiUrl: process.env.AI_API_URL || "https://chatapi.akash.network/api/v1",
      hasApiKey: !!process.env.AI_API_KEY,
    };
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to get config", message: error.message });
  }
});

app.get("/api/models", async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const apiUrl = process.env.AI_API_URL || "https://chatapi.akash.network/api/v1";
    const apiKey = process.env.AI_API_KEY;
    if (apiUrl.includes("pollinations.ai")) {
      const data = {
        data: [
          { id: "openai", object: "model", created: Date.now(), owned_by: "pollinations" },
          { id: "mistral", object: "model", created: Date.now(), owned_by: "pollinations" },
          { id: "claude", object: "model", created: Date.now(), owned_by: "pollinations" },
        ],
      };
      return res.status(200).json(data);
    }
    if (!apiKey) {
      return res.status(500).json({ error: "API key not configured" });
    }
    const response = await fetch(`${apiUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch models", message: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { prompt, model } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    const apiUrl = process.env.AI_API_URL || "https://chatapi.akash.network/api/v1";
    const apiKey = process.env.AI_API_KEY;
    const defaultModel = process.env.AI_DEFAULT_MODEL || "DeepSeek-R1-0528";
    if (!apiUrl.includes("pollinations.ai") && !apiKey) {
      return res.status(500).json({ error: "API key not configured" });
    }
    const selectedModel = (model && model.trim()) || defaultModel;
    let finalApiUrl = apiUrl.trim() + "/chat/completions";
    if (apiUrl.includes("pollinations.ai")) {
      finalApiUrl = apiUrl.trim();
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);
    try {
      let requestBody, headers;
      if (apiUrl.includes("pollinations.ai")) {
        headers = { "Content-Type": "application/json" };
        if (apiKey && apiKey !== "not-required") {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }
        const messages = [
          { role: "system", content: "You must respond with valid JSON format only. Do not include any text outside the JSON structure." },
          { role: "user", content: prompt },
        ];
        requestBody = { model: selectedModel || "openai", messages, seed: Math.floor(Math.random() * 1000) };
      } else {
        headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
        requestBody = {
          model: selectedModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 4000,
          temperature: 0.7,
          stream: false,
        };
      }
      const response = await fetch(finalApiUrl, { method: "POST", headers, body: JSON.stringify(requestBody), signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        return res.status(500).json({ error: "Internal server error", message: "Request timeout - AI API took too long to respond" });
      }
      return res.status(500).json({ error: "Internal server error", message: err.message });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

app.post("/api/image", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { prompt, width, height, model, seed, nologo, enhance, safe } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    const imageApiUrl = process.env.IMAGE_API_URL || "https://image.pollinations.ai";
    const imageApiKey = process.env.IMAGE_API_KEY || "";
    const imageReferrer = process.env.IMAGE_REFERRER || "";
    const defaultModel = process.env.IMAGE_DEFAULT_MODEL || "flux";
    const selectedModel = (model && model.trim()) || defaultModel;
    const baseUrl = `${imageApiUrl.trim()}/prompt/${encodeURIComponent(prompt)}`;
    const params = new URLSearchParams();
    params.append("model", selectedModel);
    params.append("width", width || "800");
    params.append("height", height || "600");
    if (seed) params.append("seed", seed);
    if (nologo === true || nologo === "true") params.append("nologo", "true");
    if (enhance === true || enhance === "true") params.append("enhance", "true");
    if (safe === true || safe === "true") params.append("safe", "true");
    const headers = {};
    if (imageApiKey) {
      headers["Authorization"] = `Bearer ${imageApiKey}`;
    }
    if (imageReferrer) {
      headers["Referer"] = imageReferrer;
      params.append("referrer", imageReferrer);
    }
    const finalUrl = `${baseUrl}?${params.toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(finalUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image generation failed: ${response.status} ${errorText}`);
      }
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        throw new Error("Invalid response: Expected image data");
      }
      res.status(200).json({ success: true, imageUrl: finalUrl, model: selectedModel, prompt, parameters: { width: width || "800", height: height || "600", seed: seed || null, nologo: nologo || false, enhance: enhance || false, safe: safe || false } });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        return res.status(500).json({ error: "Internal server error", message: "Request timeout - Image generation took too long" });
      }
      return res.status(500).json({ error: "Internal server error", message: err.message });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

app.use(express.static(process.cwd()));

const port = process.env.PORT || 3000;
app.listen(port, () => {});

