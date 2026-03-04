const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ENV_PATH = path.join(__dirname, ".env");
const DATA_DIR = path.join(__dirname, "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const HISTORY_PATH = path.join(DATA_DIR, "cv-history.json");
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = value;
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, "[]", "utf8");
  if (!fs.existsSync(HISTORY_PATH)) fs.writeFileSync(HISTORY_PATH, "{}", "utf8");
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 15 * 1024 * 1024) {
        reject(new Error("Payload trop volumineux."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON invalide."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeCvData(data) {
  const empty = {
    profile: "",
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    interests: [],
    other: [],
  };
  const cleaned = {
    candidate: {
      fullName: data?.candidate?.fullName || "",
      email: data?.candidate?.email || "",
      phone: data?.candidate?.phone || "",
      location: data?.candidate?.location || "",
      linkedin: data?.candidate?.linkedin || "",
      website: data?.candidate?.website || "",
      photoDataUrl: data?.candidate?.photoDataUrl || "",
    },
    sections: { ...empty, ...(data?.sections || {}) },
  };
  Object.keys(cleaned.sections).forEach((key) => {
    if (key === "profile") {
      cleaned.sections[key] = String(cleaned.sections[key] || "").trim();
      return;
    }
    if (!Array.isArray(cleaned.sections[key])) cleaned.sections[key] = [];
    cleaned.sections[key] = cleaned.sections[key]
      .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry || "").trim()))
      .filter(Boolean);
  });
  return cleaned;
}

function extractFirstJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Le modele n'a pas retourne de JSON exploitable.");
  }
  return text.slice(firstBrace, lastBrace + 1);
}

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    createdAt: user.createdAt,
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 150000, 64, "sha512").toString("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createUser({ email, password, name }) {
  const users = readJsonFile(USERS_PATH, []);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!emailIsValid(normalizedEmail)) throw new Error("Email invalide.");
  if (String(password || "").length < 6) throw new Error("Mot de passe trop court (min 6).");
  if (users.some((u) => u.email === normalizedEmail)) throw new Error("Cet email existe deja.");
  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    name: String(name || "").trim(),
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJsonFile(USERS_PATH, users);
  return user;
}

function loginUser({ email, password }) {
  const users = readJsonFile(USERS_PATH, []);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) throw new Error("Email ou mot de passe invalide.");
  const candidateHash = hashPassword(String(password || ""), user.salt);
  if (candidateHash !== user.passwordHash) throw new Error("Email ou mot de passe invalide.");
  return user;
}

function getAuthToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function getSessionUser(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const users = readJsonFile(USERS_PATH, []);
  return users.find((u) => u.id === session.userId) || null;
}

function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Authentification requise." });
    return null;
  }
  return user;
}

function createSession(userId) {
  const token = createToken();
  sessions.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function detectContactsFromText(text) {
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])[0] || "";
  const phone = (text.match(/(?:\+\d{1,3}\s?)?(?:\d[\s.-]?){8,14}\d/g) || [])[0] || "";
  const linkedin = (text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/gi) || [])[0] || "";
  const website = (text.match(/https?:\/\/[^\s)]+/gi) || []).find((u) => !u.includes("linkedin.com")) || "";
  return { email, phone, linkedin, website };
}

function simpleSectionParse(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const contacts = detectContactsFromText(text);
  const headings = {
    profile: /(profil|summary|about|objectif)/i,
    experience: /(experience|experiences|emploi|professional)/i,
    education: /(formation|education|etudes|diplome)/i,
    skills: /(competences|skills|technologies|outils)/i,
    projects: /(projets|projects)/i,
    certifications: /(certification|certifications)/i,
    languages: /(langues|languages)/i,
    interests: /(interets|hobbies|centres d'interet)/i,
  };
  let current = "other";
  const sections = {
    profile: "",
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    interests: [],
    other: [],
  };
  for (const line of lines) {
    let switched = false;
    Object.entries(headings).forEach(([key, pattern]) => {
      if (pattern.test(line) && line.length <= 40) {
        current = key;
        switched = true;
      }
    });
    if (switched) continue;
    if (current === "profile" && !sections.profile) {
      sections.profile = line;
    } else if (current === "profile") {
      sections.profile += ` ${line}`;
    } else if (Array.isArray(sections[current])) {
      sections[current].push(line);
    } else {
      sections.other.push(line);
    }
  }
  const nameCandidate = lines.find((line) => /^[A-Za-zÀ-ÿ' -]{4,}$/.test(line) && line.split(" ").length <= 5) || "";
  return normalizeCvData({
    candidate: {
      fullName: nameCandidate,
      email: contacts.email,
      phone: contacts.phone,
      location: "",
      linkedin: contacts.linkedin,
      website: contacts.website,
    },
    sections,
  });
}

function minimalFallbackCvData() {
  return normalizeCvData({
    candidate: {
      fullName: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      website: "",
    },
    sections: {
      profile: "",
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
      interests: [],
      other: [],
    },
  });
}

function decodeBase64ToText(base64Data) {
  try {
    const raw = Buffer.from(String(base64Data || ""), "base64").toString("utf8");
    return raw
      .replace(/\0/g, " ")
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00C0-\u017F]/g, " ")
      .replace(/[ \t]{2,}/g, " ");
  } catch {
    return "";
  }
}

function extractLikelyName(lines) {
  for (const line of lines) {
    const cleaned = String(line || "").trim();
    if (!cleaned) continue;
    if (cleaned.length < 4 || cleaned.length > 60) continue;
    if (/[0-9@:/\\]/.test(cleaned)) continue;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) continue;
    const alphaWords = words.filter((w) => /^[A-Za-zÀ-ÿ'’-]+$/.test(w));
    if (alphaWords.length !== words.length) continue;
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  return "";
}

function buildFallbackCvData({ base64Data }) {
  const decoded = decodeBase64ToText(base64Data);
  const lines = decoded
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return minimalFallbackCvData();
  }

  const parsed = simpleSectionParse(decoded);
  if (!parsed.candidate.fullName) {
    parsed.candidate.fullName = extractLikelyName(lines);
  }
  return normalizeCvData(parsed);
}

async function callGoogleJson({ prompt, payloadData, responseMimeType = "application/json" }) {
  const apiKey =
    process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Cle Google AI manquante. Configure GOOGLE_AI_API_KEY (ou GOOGLE_API_KEY / GEMINI_API_KEY).");
  }
  const configuredModels = String(process.env.GOOGLE_AI_MODELS || process.env.GOOGLE_AI_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = [...new Set([...configuredModels, "gemini-2.5-flash", "gemini-2.0-flash"])];
  let lastErr = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [{ parts: [prompt, ...payloadData] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType,
      },
    };
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const bodyText = await response.text();
      let details = bodyText;
      try {
        const parsed = JSON.parse(bodyText);
        details = parsed?.error?.message || parsed?.message || bodyText;
      } catch {}
      const err = new Error(`Google AI API error (${response.status}) [${model}]: ${String(details).slice(0, 400)}`);
      err.statusCode = response.status;
      err.model = model;
      lastErr = err;
      if (response.status === 429 || response.status === 404 || response.status === 503) continue;
      throw err;
    }
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    if (!text) throw new Error("Reponse vide de Google AI.");
    try {
      return JSON.parse(text);
    } catch {
      return JSON.parse(extractFirstJson(text));
    }
  }
  throw lastErr || new Error("Appel Google AI en echec.");
}

async function analyzeCvWithGoogleAI({ fileName, mimeType, base64Data, language = "fr" }) {
  const prompt = {
    text: `
Tu es un assistant RH expert en parsing de CV.
Analyse le CV fourni et retourne UNIQUEMENT un JSON valide (sans texte autour), en ${language}.
{
  "candidate": {
    "fullName": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string",
    "website": "string"
  },
  "sections": {
    "profile": "string",
    "experience": ["string"],
    "education": ["string"],
    "skills": ["string"],
    "projects": ["string"],
    "certifications": ["string"],
    "languages": ["string"],
    "interests": ["string"],
    "other": ["string"]
  }
}
Regles:
- N'invente pas d'informations.
- Chaque ligne de tableau doit etre concise.
`.trim(),
  };

  const payloadData = [
    {
      inline_data: {
        mime_type: mimeType || "application/pdf",
        data: base64Data,
      },
    },
  ];
  const parsed = await callGoogleJson({ prompt, payloadData });
  return normalizeCvData(parsed);
}

function improveLocally(cvData, focus) {
  const d = normalizeCvData(cvData);
  const addPeriod = (str) => {
    if (!str) return str;
    return /[.!?]$/.test(str) ? str : `${str}.`;
  };
  const cleanLine = (line) => line.replace(/\s+/g, " ").trim();
  d.sections.profile = addPeriod(cleanLine(d.sections.profile));
  d.sections.skills = [...new Set(d.sections.skills.map((s) => cleanLine(s).toLowerCase()))]
    .map((s) => s.replace(/\b\w/g, (m) => m.toUpperCase()))
    .sort((a, b) => a.localeCompare(b));
  d.sections.experience = d.sections.experience.map((line) => {
    const l = cleanLine(line);
    if (!l) return l;
    if (/^(managed|developed|created|led|built|improved|concu|developpe|pilote)/i.test(l)) return addPeriod(l);
    return addPeriod(`Realisation: ${l}`);
  });
  return {
    cvData: d,
    suggestions: [
      `Focus applique: ${focus || "clarte generale"}`,
      "Competences dedupliquees et normalisees.",
      "Phrases d'experience reformulees de maniere actionnable.",
    ],
    source: "local-fallback",
  };
}

async function improveWithGoogleAI(cvData, focus) {
  const normalized = normalizeCvData(cvData);
  const prompt = {
    text: `
Tu es un coach CV senior.
Ameliore le CV JSON ci-dessous pour maximiser la clarte, l'impact et la lisibilite ATS.
Focus prioritaire: ${focus || "impact des experiences"}.
Retourne UNIQUEMENT un JSON valide avec cette structure:
{
  "cvData": { ...meme schema qu'en entree... },
  "suggestions": ["string", "string", "string"]
}
Contraintes:
- Ne fabrique pas d'experiences non presentes.
- Tu peux reformuler et reorganiser.
- Garde une langue professionnelle.
`.trim(),
  };
  const payloadData = [{ text: JSON.stringify(normalized) }];
  const parsed = await callGoogleJson({ prompt, payloadData });
  return {
    cvData: normalizeCvData(parsed?.cvData || parsed),
    suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions.map(String) : [],
    source: "google-ai",
  };
}

function buildHistoryItem(cvData, note) {
  const title = cvData?.candidate?.fullName || "CV sans nom";
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    note: String(note || "").trim(),
    title,
    cvData: normalizeCvData(cvData),
  };
}

function listHistoryForUser(userId) {
  const store = readJsonFile(HISTORY_PATH, {});
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function saveHistoryForUser(userId, list) {
  const store = readJsonFile(HISTORY_PATH, {});
  store[userId] = list;
  writeJsonFile(HISTORY_PATH, store);
}

function serveStatic(req, res) {
  const cleanUrl = req.url.split("?")[0];
  const cleanPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Acces refuse." });
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") return sendJson(res, 404, { error: "Fichier introuvable." });
      return sendJson(res, 500, { error: "Erreur serveur." });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

loadEnvFile(ENV_PATH);
ensureDataFiles();

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, service: "mycv-api", now: new Date().toISOString() });
  }

  if (req.url === "/api/auth/register" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const user = createUser(body || {});
      const token = createSession(user.id);
      return sendJson(res, 201, { message: "Inscription reussie.", token, user: sanitizeUser(user) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Inscription impossible." });
    }
  }

  if (req.url === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const user = loginUser(body || {});
      const token = createSession(user.id);
      return sendJson(res, 200, { message: "Connexion reussie.", token, user: sanitizeUser(user) });
    } catch (error) {
      return sendJson(res, 401, { error: error.message || "Connexion impossible." });
    }
  }

  if (req.url === "/api/auth/me" && req.method === "GET") {
    const user = requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, { user: sanitizeUser(user) });
  }

  if (req.url === "/api/auth/logout" && req.method === "POST") {
    const token = getAuthToken(req);
    if (token) sessions.delete(token);
    return sendJson(res, 200, { message: "Deconnecte." });
  }

  if (req.url === "/api/cv/analyze" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const fileName = body?.fileName || "";
      const mimeType = body?.mimeType || "";
      const base64Data = body?.base64Data || "";
      const language = body?.language || "fr";
      if (!fileName || !base64Data) return sendJson(res, 400, { error: "fileName et base64Data sont obligatoires." });

      try {
        const cvData = await analyzeCvWithGoogleAI({ fileName, mimeType, base64Data, language });
        return sendJson(res, 200, { message: "Analyse terminee", fileName, cvData, source: "google-ai", fallback: false });
      } catch (error) {
        const isQuota = error?.statusCode === 429 || String(error.message || "").includes("429");
        const cvData = buildFallbackCvData({ base64Data });
        if (isQuota) {
          return sendJson(res, 200, {
            message: "Quota Google AI depasse. Passage en mode fallback.",
            warning:
              "Quota Google AI depasse (429). Active billing/plan dans Google AI Studio ou attends le reset. Le mode fallback est applique.",
            cvData,
            source: "fallback",
            fallback: true,
          });
        }
        const statusCode = Number(error?.statusCode || 0);
        const warningByStatus = {
          400: "Google AI a refuse la requete (400). Verifie le format du fichier (PDF recommande) et sa taille.",
          401: "Google AI a refuse la cle API (401). Verifie GOOGLE_AI_API_KEY / GOOGLE_API_KEY.",
          403: "Google AI a refuse l'acces (403). Verifie API activee, projet et billing Google.",
          404: "Modele Google AI introuvable (404). Verifie GOOGLE_AI_MODEL/GOOGLE_AI_MODELS.",
        };
        return sendJson(res, 200, {
          message: "Analyse IA indisponible. Passage en mode fallback.",
          warning:
            warningByStatus[statusCode] ||
            "Google AI a retourne une erreur. Verifie la cle API, le projet Google, et billing. Le mode fallback est applique pour continuer.",
          aiError: String(error?.message || "unknown"),
          cvData,
          source: "fallback",
          fallback: true,
        });
      }
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Erreur lors de l'analyse du CV." });
    }
  }

  if (req.url === "/api/cv/improve" && req.method === "POST") {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await parseJsonBody(req);
      const inputCv = normalizeCvData(body?.cvData || {});
      const focus = String(body?.focus || "").trim();
      try {
        const improved = await improveWithGoogleAI(inputCv, focus);
        return sendJson(res, 200, {
          message: "CV ameliore avec IA.",
          ...improved,
          fallback: false,
        });
      } catch (error) {
        const local = improveLocally(inputCv, focus);
        return sendJson(res, 200, {
          message: "Amelioration locale appliquee (fallback).",
          warning: error?.statusCode === 429 ? "Quota Google AI depasse pendant l'amelioration." : "Google AI indisponible.",
          ...local,
          fallback: true,
        });
      }
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Echec amelioration CV." });
    }
  }

  if (req.url === "/api/cv/save" && req.method === "PUT") {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await parseJsonBody(req);
      const cvData = normalizeCvData(body?.cvData || {});
      const note = String(body?.note || "").trim();
      const outputPath = path.join(__dirname, "cv-last-edit.json");
      writeJsonFile(outputPath, cvData);

      const history = listHistoryForUser(user.id);
      const item = buildHistoryItem(cvData, note);
      history.unshift(item);
      saveHistoryForUser(user.id, history.slice(0, 50));

      return sendJson(res, 200, {
        message: "CV sauvegarde et version historisee.",
        outputPath,
        version: { id: item.id, createdAt: item.createdAt, note: item.note, title: item.title },
      });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Echec sauvegarde CV." });
    }
  }

  if (req.url === "/api/cv/history" && req.method === "GET") {
    const user = requireAuth(req, res);
    if (!user) return;
    const history = listHistoryForUser(user.id).map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      note: item.note,
      title: item.title,
    }));
    return sendJson(res, 200, { history });
  }

  if (req.url.startsWith("/api/cv/history/") && req.method === "GET") {
    const user = requireAuth(req, res);
    if (!user) return;
    const id = decodeURIComponent(req.url.split("/").pop() || "");
    const history = listHistoryForUser(user.id);
    const item = history.find((x) => x.id === id);
    if (!item) return sendJson(res, 404, { error: "Version introuvable." });
    return sendJson(res, 200, { version: item });
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  const keyInfo = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY ? "configured" : "missing";
  const modelInfo = process.env.GOOGLE_AI_MODELS || process.env.GOOGLE_AI_MODEL || "default";
  console.log(`MyCV server running: http://${HOST}:${PORT}`);
  console.log(`GOOGLE_AI_API_KEY: ${keyInfo}`);
  console.log(`GOOGLE_AI_MODEL(S): ${modelInfo}`);
});
