const https = require("https");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/${path}`,
      method,
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "combiovens",
        "Content-Type": "application/json",
        ...(data && { "Content-Length": Buffer.byteLength(data) }),
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function readFile(filePath) {
  const res = await githubRequest("GET", filePath);
  if (res.content) {
    return JSON.parse(Buffer.from(res.content, "base64").toString("utf8"));
  }
  return [];
}

async function writeFile(filePath, data) {
  const current = await githubRequest("GET", filePath).catch(() => null);
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const body = {
    message: `Update ${filePath}`,
    content,
    ...(current && current.sha && { sha: current.sha }),
  };
  return githubRequest("PUT", filePath, body);
}

async function appendToFile(filePath, newItem) {
  const existing = await readFile(filePath).catch(() => []);
  const updated = [...existing, newItem];
  await writeFile(filePath, updated);
  return updated;
}


async function updateQuote(quoteId, updates) {
  const quotes = await readFile('data/quotes.json').catch(() => []);
  const idx = quotes.findIndex(q => q.quoteId === quoteId);
  if (idx === -1) {
    const updated = [...quotes, { quoteId, ...updates }];
    await writeFile('data/quotes.json', updated);
    return updated[updated.length - 1];
  }
  quotes[idx] = { ...quotes[idx], ...updates };
  await writeFile('data/quotes.json', quotes);
  return quotes[idx];
}
module.exports = { readFile, writeFile, appendToFile, updateQuote };
