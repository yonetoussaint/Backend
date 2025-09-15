import axios from "axios";
import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data");
const EMB_FILE = path.join(STORE_PATH, "embeddings.json");

if (!fs.existsSync(STORE_PATH)) fs.mkdirSync(STORE_PATH, { recursive: true });

export async function createEmbedding(text) {
  const url = "https://openrouter.ai/api/v1/embeddings";
  const { data } = await axios.post(
    url,
    { model: process.env.EMBED_MODEL || "openai/text-embedding-3-small", input: text },
    { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" } }
  );
  return data.data[0].embedding;
}

export async function saveRepoEmbeddings(files) {
  const store = [];
  for (const f of files) {
    const chunk = f.content.slice(0, 2000); // truncate large files to keep tokens reasonable
    const embedding = await createEmbedding(chunk);
    store.push({ path: f.path, content: chunk, embedding });
  }
  fs.writeFileSync(EMB_FILE, JSON.stringify(store, null, 2));
  return store;
}

export function loadRepoEmbeddings() {
  if (!fs.existsSync(EMB_FILE)) return [];
  return JSON.parse(fs.readFileSync(EMB_FILE, "utf8"));
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function searchRelevantFiles(question, k = 3) {
  const store = loadRepoEmbeddings();
  if (!store.length) return [];

  const qEmbedding = await createEmbedding(question);

  const scored = store.map(item => ({ ...item, score: cosineSim(qEmbedding, item.embedding) }));
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}