import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import { fetchRepoFiles } from "./github.js";
import { saveRepoEmbeddings, searchRelevantFiles } from "./embeddings.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" })); // restrict in prod

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat-v3.1:free";

// Simple health
app.get("/", (req, res) => res.send("DeepSeek backend alive"));

// 1) Regular ask
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "question required" });

    const resp = await axios.post(
      API_URL,
      { model: MODEL, messages: [{ role: "user", content: question }] },
      { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" } }
    );

    const answer = resp.data.choices?.[0]?.message?.content ?? resp.data;
    res.json({ answer });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "failed to call model" });
  }
});

// 2) Build embeddings (protected via BUILD_SECRET)
app.post("/build-embeddings", async (req, res) => {
  try {
    const secret = req.headers["x-build-secret"];
    if (!process.env.BUILD_SECRET || secret !== process.env.BUILD_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }

    const files = await fetchRepoFiles(process.env.GITHUB_REPO, process.env.GITHUB_TOKEN);
    const store = await saveRepoEmbeddings(files);
    res.json({ message: "embeddings built", count: store.length });
  } catch (err) {
    console.error("build error:", err.response?.data || err.message);
    res.status(500).json({ error: "failed to build embeddings" });
  }
});

// 3) Ask about repo (vector search)
app.post("/ask-repo", async (req, res) => {
  try {
    const { question, k = 3 } = req.body;
    if (!question) return res.status(400).json({ error: "question required" });

    const relevant = await searchRelevantFiles(question, k);
    const context = relevant.map(f => `File: ${f.path}\n${f.content}`).join("\n\n");

    const resp = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [
          { role: "system", content: "You are an assistant answering with only the given repo context." },
          { role: "user", content: `Repo context:\n${context}\n\nQuestion: ${question}` }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" } }
    );

    const answer = resp.data.choices?.[0]?.message?.content ?? resp.data;
    res.json({ answer, relevant: relevant.map(r => ({ path: r.path, score: r.score })) });
  } catch (err) {
    console.error("ask-repo error:", err.response?.data || err.message);
    res.status(500).json({ error: "failed to query repo" });
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));