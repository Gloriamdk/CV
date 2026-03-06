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
const ACTIVITY_PATH = path.join(DATA_DIR, "activity-log.json");
const INVITES_PATH = path.join(DATA_DIR, "invite-codes.json");
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
  if (!fs.existsSync(ACTIVITY_PATH)) fs.writeFileSync(ACTIVITY_PATH, "[]", "utf8");
  if (!fs.existsSync(INVITES_PATH)) fs.writeFileSync(INVITES_PATH, "[]", "utf8");
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
    role: user.role === "admin" ? "admin" : "user",
    accountStatus: normalizeAccountStatus(user.accountStatus),
    createdAt: user.createdAt,
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 150000, 64, "sha512").toString("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "user";
}

function normalizeAccountStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "PENDING" || s === "BLOCKED" || s === "ACTIVE") return s;
  return "ACTIVE";
}

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

function invitationCodesEnabled() {
  const raw = String(process.env.ENABLE_INVITE_CODES || "true").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function invitationCodeRequired() {
  const raw = String(process.env.REQUIRE_INVITE_CODE || "true").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isLocalRequest(req) {
  const remote = String(req.socket?.remoteAddress || "");
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function isAdminLocalOnlyEnabled() {
  const raw = String(process.env.ADMIN_LOCAL_ONLY || "true").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function createUser({ email, password, name, role = "user", accountStatus = "PENDING" }) {
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
    role: normalizeRole(role),
    accountStatus: normalizeAccountStatus(accountStatus),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJsonFile(USERS_PATH, users);
  return user;
}

function isPublicRegistrationEnabled() {
  const raw = String(process.env.ALLOW_PUBLIC_REGISTRATION || "true").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function loginUser({ email, password }) {
  const users = readJsonFile(USERS_PATH, []);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) throw new Error("Email ou mot de passe invalide.");
  const candidateHash = hashPassword(String(password || ""), user.salt);
  if (candidateHash !== user.passwordHash) throw new Error("Email ou mot de passe invalide.");
  if (!user.role) {
    user.role = "user";
    writeJsonFile(USERS_PATH, users);
  }
  if (!user.accountStatus) {
    user.accountStatus = "ACTIVE";
    writeJsonFile(USERS_PATH, users);
  }
  return user;
}

function ensureUserActive(user, res) {
  const status = normalizeAccountStatus(user?.accountStatus);
  if (status === "PENDING") {
    sendJson(res, 403, { error: "Votre compte est en attente de validation par l'administrateur." });
    return false;
  }
  if (status === "BLOCKED") {
    sendJson(res, 403, { error: "Votre compte est bloque. Contacte l'administrateur." });
    return false;
  }
  return true;
}

function readInviteCodes() {
  return readJsonFile(INVITES_PATH, []);
}

function writeInviteCodes(codes) {
  writeJsonFile(INVITES_PATH, Array.isArray(codes) ? codes : []);
}

function isInviteExpired(invite) {
  if (!invite?.expiresAt) return false;
  const expires = new Date(invite.expiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  return Date.now() > expires;
}

function consumeInviteCode(rawCode, userEmail) {
  const code = normalizeInviteCode(rawCode);
  if (!code) throw new Error("Code d'invitation requis.");
  const invites = readInviteCodes();
  const invite = invites.find((x) => normalizeInviteCode(x.code) === code);
  if (!invite) throw new Error("Code d'invitation invalide.");
  if (invite.used) throw new Error("Code d'invitation deja utilise.");
  if (isInviteExpired(invite)) throw new Error("Code d'invitation expire.");
  invite.used = true;
  invite.usedAt = new Date().toISOString();
  invite.usedBy = String(userEmail || "").trim().toLowerCase();
  writeInviteCodes(invites);
}

function createInviteCode({ createdBy, expiresAt = "" }) {
  const code = crypto.randomBytes(5).toString("hex").toUpperCase();
  const invite = {
    id: crypto.randomUUID(),
    code,
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy || ""),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
    used: false,
    usedAt: "",
    usedBy: "",
  };
  const invites = readInviteCodes();
  invites.unshift(invite);
  writeInviteCodes(invites);
  return invite;
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

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!ensureUserActive(user, res)) return null;
  if (normalizeRole(user.role) !== "admin") {
    sendJson(res, 403, { error: "Acces admin requis." });
    return null;
  }
  if (isAdminLocalOnlyEnabled() && !isLocalRequest(req)) {
    sendJson(res, 403, { error: "Acces admin autorise uniquement en local (127.0.0.1)." });
    return null;
  }
  return user;
}

function createSession(userId) {
  const token = createToken();
  sessions.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function migrateUsersRoles() {
  const users = readJsonFile(USERS_PATH, []);
  let changed = false;
  for (const user of users) {
    const role = normalizeRole(user.role);
    const accountStatus = normalizeAccountStatus(user.accountStatus);
    if (user.role !== role) {
      user.role = role;
      changed = true;
    }
    if (user.accountStatus !== accountStatus) {
      user.accountStatus = accountStatus;
      changed = true;
    }
  }
  if (changed) writeJsonFile(USERS_PATH, users);
}

function ensureAdminUserFromEnv() {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  const adminName = String(process.env.ADMIN_NAME || "Administrator").trim();
  if (!adminEmail || !adminPassword) return;
  if (!emailIsValid(adminEmail)) return;
  if (adminPassword.length < 6) return;

  const users = readJsonFile(USERS_PATH, []);
  const existing = users.find((u) => u.email === adminEmail);
  if (existing) {
    if (normalizeRole(existing.role) !== "admin") {
      existing.role = "admin";
      writeJsonFile(USERS_PATH, users);
    }
    return;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  users.push({
    id: crypto.randomUUID(),
    email: adminEmail,
    name: adminName,
    salt,
    passwordHash: hashPassword(adminPassword, salt),
    role: "admin",
    accountStatus: "ACTIVE",
    createdAt: new Date().toISOString(),
  });
  writeJsonFile(USERS_PATH, users);
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

async function translateCvWithGoogleAI(cvData, targetLanguage) {
  const normalized = normalizeCvData(cvData);
  const prompt = {
    text: `
Tu es un traducteur professionnel de CV.
Traduis le JSON CV ci-dessous vers la langue cible: ${targetLanguage}.
Retourne UNIQUEMENT un JSON valide avec EXACTEMENT le meme schema.
Contraintes:
- Ne change pas la structure des cles.
- Ne fabrique aucune information.
- Traduis uniquement le contenu texte.
`.trim(),
  };
  const payloadData = [{ text: JSON.stringify(normalized) }];
  const parsed = await callGoogleJson({ prompt, payloadData });
  return normalizeCvData(parsed?.cvData || parsed);
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

function logActivity(user, action, meta = {}) {
  const list = readJsonFile(ACTIVITY_PATH, []);
  list.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: user?.id || "",
    userEmail: user?.email || "",
    role: normalizeRole(user?.role),
    action: String(action || "unknown"),
    meta: meta && typeof meta === "object" ? meta : {},
  });
  writeJsonFile(ACTIVITY_PATH, list.slice(0, 5000));
}

function listRecentActions(limit = 200) {
  const list = readJsonFile(ACTIVITY_PATH, []);
  return list.slice(0, Math.max(1, Math.min(Number(limit || 200), 2000)));
}

function userMetricsFromLogs(userId, logs) {
  const forUser = logs.filter((x) => String(x.userId) === String(userId));
  const cvCreated = forUser.filter((x) => x.action === "cv.save").length;
  const imports = forUser.filter((x) => x.action === "cv.upload");
  const exportsPdf = forUser.filter((x) => x.action === "cv.export.pdf");
  return {
    cvCreated,
    lastImportAt: imports[0]?.at || "",
    lastImportFile: imports[0]?.meta?.fileName || "",
    lastPdfExportAt: exportsPdf[0]?.at || "",
  };
}

function serveStatic(req, res) {
  const cleanUrl = req.url.split("?")[0];
  const normalizedUrl = cleanUrl !== "/" ? cleanUrl.replace(/\/+$/, "") : cleanUrl;
  const cleanPath = normalizedUrl === "/" ? "/index.html" : normalizedUrl;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Acces refuse." });
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") return sendJson(res, 404, { error: "Fichier introuvable." });
      return sendJson(res, 500, { error: "Erreur serveur." });
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" };
    if (ext === ".html" || ext === ".js" || ext === ".css") {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
      headers.Pragma = "no-cache";
      headers.Expires = "0";
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

loadEnvFile(ENV_PATH);
ensureDataFiles();
migrateUsersRoles();
ensureAdminUserFromEnv();

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
      if (!isPublicRegistrationEnabled()) {
        return sendJson(res, 403, {
          error: "Inscription publique desactivee. Seul un admin peut creer des comptes utilisateurs.",
        });
      }
      const body = await parseJsonBody(req);
      const user = createUser({ ...(body || {}), accountStatus: "PENDING", role: "user" });
      logActivity(user, "auth.register", { accountStatus: "PENDING" });
      return sendJson(res, 201, {
        message: "Inscription enregistree. Ton compte est en attente d'activation par l'administrateur.",
        user: sanitizeUser(user),
        pending: true,
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Inscription impossible." });
    }
  }

  if (req.url === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const user = loginUser(body || {});
      const token = createSession(user.id);
      logActivity(user, "auth.login", {});
      return sendJson(res, 200, { message: "Connexion reussie.", token, user: sanitizeUser(user) });
    } catch (error) {
      return sendJson(res, 401, { error: error.message || "Connexion impossible." });
    }
  }

  if (req.url === "/api/auth/config" && req.method === "GET") {
    return sendJson(res, 200, {
      allowPublicRegistration: isPublicRegistrationEnabled(),
      adminLocalOnly: isAdminLocalOnlyEnabled(),
      requireInviteCode: false,
    });
  }

  if (req.url === "/api/auth/me" && req.method === "GET") {
    const user = requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, { user: sanitizeUser(user) });
  }

  if (req.url === "/api/auth/logout" && req.method === "POST") {
    const user = getSessionUser(req);
    const token = getAuthToken(req);
    if (token) sessions.delete(token);
    if (user) logActivity(user, "auth.logout", {});
    return sendJson(res, 200, { message: "Deconnecte." });
  }

  if (req.url === "/api/admin/users" && req.method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const users = readJsonFile(USERS_PATH, []).map((u) => sanitizeUser(u));
    return sendJson(res, 200, { users });
  }

  if (req.url === "/api/admin/users" && req.method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    return sendJson(res, 403, {
      error: "Creation manuelle des comptes desactivee. Utilise l'inscription utilisateur avec code d'invitation.",
    });
  }

  if (req.url === "/api/admin/invite-codes" && req.method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const invites = readInviteCodes()
      .map((x) => ({
        id: x.id,
        code: x.code,
        createdAt: x.createdAt,
        createdBy: x.createdBy || "",
        expiresAt: x.expiresAt || "",
        used: Boolean(x.used),
        usedAt: x.usedAt || "",
        usedBy: x.usedBy || "",
        expired: isInviteExpired(x),
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return sendJson(res, 200, { invites });
  }

  if (req.url === "/api/admin/invite-codes" && req.method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    try {
      const body = await parseJsonBody(req);
      const days = Number(body?.expiresInDays || 0);
      let expiresAt = "";
      if (Number.isFinite(days) && days > 0) {
        const dt = new Date();
        dt.setDate(dt.getDate() + Math.min(days, 365));
        expiresAt = dt.toISOString();
      }
      const invite = createInviteCode({ createdBy: admin.email, expiresAt });
      logActivity(admin, "admin.invite.create", { inviteId: invite.id, code: invite.code, expiresAt: invite.expiresAt || "" });
      return sendJson(res, 201, { message: "Code d'invitation cree.", invite });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Creation code impossible." });
    }
  }

  if (req.url.startsWith("/api/admin/users/") && req.url.endsWith("/status") && req.method === "PUT") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    try {
      const parts = req.url.split("?")[0].split("/").filter(Boolean);
      const userId = parts[3] || "";
      const body = await parseJsonBody(req);
      const nextStatus = normalizeAccountStatus(body?.accountStatus);
      const users = readJsonFile(USERS_PATH, []);
      const target = users.find((u) => u.id === userId);
      if (!target) return sendJson(res, 404, { error: "Utilisateur introuvable." });
      target.accountStatus = nextStatus;
      writeJsonFile(USERS_PATH, users);
      logActivity(admin, "admin.user.status", { targetUserId: userId, accountStatus: nextStatus });
      return sendJson(res, 200, { message: "Statut mis a jour.", user: sanitizeUser(target) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Mise a jour statut impossible." });
    }
  }

  if (req.url.startsWith("/api/admin/activity") && req.method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const parsedUrl = new URL(req.url, "http://localhost");
    const userId = String(parsedUrl.searchParams.get("userId") || "").trim();
    const action = String(parsedUrl.searchParams.get("action") || "").trim();
    const limit = Math.min(Math.max(Number(parsedUrl.searchParams.get("limit") || 200), 1), 1000);
    let logs = readJsonFile(ACTIVITY_PATH, []);
    if (userId) logs = logs.filter((x) => String(x.userId) === userId);
    if (action) logs = logs.filter((x) => String(x.action) === action);
    return sendJson(res, 200, { logs: logs.slice(0, limit) });
  }

  if (req.url === "/api/admin/overview" && req.method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const users = readJsonFile(USERS_PATH, []);
    const histories = readJsonFile(HISTORY_PATH, {});
    const logs = listRecentActions(500);
    const usersWithMetrics = users.map((u) => {
      const list = Array.isArray(histories[u.id]) ? histories[u.id] : [];
      return {
        ...sanitizeUser(u),
        cvCount: list.length,
        ...userMetricsFromLogs(u.id, logs),
      };
    });
    const totalCv = usersWithMetrics.reduce((sum, u) => sum + Number(u.cvCount || 0), 0);
    const pendingUsers = usersWithMetrics.filter((u) => u.accountStatus === "PENDING").length;
    const blockedUsers = usersWithMetrics.filter((u) => u.accountStatus === "BLOCKED").length;
    const recentImports = logs.filter((x) => x.action === "cv.upload").slice(0, 30);
    const recentExportsPdf = logs.filter((x) => x.action === "cv.export.pdf").slice(0, 30);
    const recentActions = logs.slice(0, 200);
    return sendJson(res, 200, {
      kpis: {
        totalUsers: usersWithMetrics.length,
        totalCv,
        pendingUsers,
        blockedUsers,
      },
      users: usersWithMetrics,
      recentImports,
      recentExportsPdf,
      recentActions,
    });
  }

  if (req.url === "/api/admin/histories" && req.method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const users = readJsonFile(USERS_PATH, []);
    const store = readJsonFile(HISTORY_PATH, {});
    const histories = users.map((u) => {
      const list = Array.isArray(store[u.id]) ? store[u.id] : [];
      return {
        user: sanitizeUser(u),
        count: list.length,
        history: list.map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          note: item.note || "",
          title: item.title || "CV sans nom",
        })),
      };
    });
    return sendJson(res, 200, { histories });
  }

  if (req.url.startsWith("/api/admin/users/") && req.url.endsWith("/history") && req.method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const parts = req.url.split("?")[0].split("/").filter(Boolean);
    const userId = parts[3] || "";
    const users = readJsonFile(USERS_PATH, []);
    const target = users.find((u) => u.id === userId);
    if (!target) return sendJson(res, 404, { error: "Utilisateur introuvable." });
    const history = listHistoryForUser(userId);
    return sendJson(res, 200, { user: sanitizeUser(target), history });
  }

  if (req.url.startsWith("/api/admin/users/") && req.url.includes("/history/") && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const parts = req.url.split("?")[0].split("/").filter(Boolean);
    const userId = parts[3] || "";
    const versionId = parts[5] || "";
    if (!userId || !versionId) return sendJson(res, 400, { error: "Parametres manquants." });
    const history = listHistoryForUser(userId);
    const next = history.filter((item) => item.id !== versionId);
    if (next.length === history.length) return sendJson(res, 404, { error: "Version introuvable." });
    saveHistoryForUser(userId, next);
    return sendJson(res, 200, { message: "Version supprimee.", userId, versionId });
  }

  if (req.url === "/api/cv/analyze" && req.method === "POST") {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      if (!ensureUserActive(user, res)) return;
      const body = await parseJsonBody(req);
      const fileName = body?.fileName || "";
      const mimeType = body?.mimeType || "";
      const base64Data = body?.base64Data || "";
      const language = body?.language || "fr";
      if (!fileName || !base64Data) return sendJson(res, 400, { error: "fileName et base64Data sont obligatoires." });
      logActivity(user, "cv.upload", { fileName, mimeType });

      try {
        const cvData = await analyzeCvWithGoogleAI({ fileName, mimeType, base64Data, language });
        logActivity(user, "cv.analyze", { fileName, language, source: "google-ai" });
        return sendJson(res, 200, { message: "Analyse terminee", fileName, cvData, source: "google-ai", fallback: false });
      } catch (error) {
        const isQuota = error?.statusCode === 429 || String(error.message || "").includes("429");
        const cvData = buildFallbackCvData({ base64Data });
        if (isQuota) {
          logActivity(user, "cv.analyze", { fileName, language, source: "fallback", reason: "quota" });
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
        logActivity(user, "cv.analyze", { fileName, language, source: "fallback", reason: "error" });
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
      if (!ensureUserActive(user, res)) return;
      const body = await parseJsonBody(req);
      const inputCv = normalizeCvData(body?.cvData || {});
      const focus = String(body?.focus || "").trim();
      try {
        const improved = await improveWithGoogleAI(inputCv, focus);
        logActivity(user, "cv.improve", { source: "google-ai", focus });
        return sendJson(res, 200, {
          message: "CV ameliore avec IA.",
          ...improved,
          fallback: false,
        });
      } catch (error) {
        const local = improveLocally(inputCv, focus);
        logActivity(user, "cv.improve", { source: "fallback", focus });
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

  if (req.url === "/api/cv/translate" && req.method === "POST") {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      if (!ensureUserActive(user, res)) return;
      const body = await parseJsonBody(req);
      const inputCv = normalizeCvData(body?.cvData || {});
      const language = String(body?.language || "fr").trim();
      try {
        const translated = await translateCvWithGoogleAI(inputCv, language);
        logActivity(user, "cv.translate", { language, source: "google-ai" });
        return sendJson(res, 200, {
          message: "CV traduit avec IA.",
          cvData: translated,
          source: "google-ai",
          fallback: false,
        });
      } catch (error) {
        logActivity(user, "cv.translate", { language, source: "fallback" });
        return sendJson(res, 200, {
          message: "Traduction IA indisponible. CV conserve sans traduction.",
          warning: error?.statusCode === 429 ? "Quota Google AI depasse pendant la traduction." : "Google AI indisponible.",
          cvData: inputCv,
          source: "fallback",
          fallback: true,
        });
      }
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Echec traduction CV." });
    }
  }

  if (req.url === "/api/activity/log" && req.method === "POST") {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      if (!ensureUserActive(user, res)) return;
      const body = await parseJsonBody(req);
      const action = String(body?.action || "").trim();
      const allowed = new Set([
        "cv.export.pdf",
        "cv.export.doc",
        "cv.preview",
      ]);
      if (!allowed.has(action)) return sendJson(res, 400, { error: "Action non autorisee." });
      const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};
      logActivity(user, action, meta);
      return sendJson(res, 200, { message: "Action journalisee." });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Journalisation impossible." });
    }
  }

  if (req.url === "/api/cv/save" && req.method === "PUT") {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      if (!ensureUserActive(user, res)) return;
      const body = await parseJsonBody(req);
      const cvData = normalizeCvData(body?.cvData || {});
      const note = String(body?.note || "").trim();
      const outputPath = path.join(__dirname, "cv-last-edit.json");
      writeJsonFile(outputPath, cvData);

      const history = listHistoryForUser(user.id);
      const item = buildHistoryItem(cvData, note);
      history.unshift(item);
      saveHistoryForUser(user.id, history.slice(0, 50));
      logActivity(user, "cv.save", { versionId: item.id, title: item.title });

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
    if (!ensureUserActive(user, res)) return;
    logActivity(user, "cv.history.list", {});
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
    if (!ensureUserActive(user, res)) return;
    const id = decodeURIComponent(req.url.split("/").pop() || "");
    const history = listHistoryForUser(user.id);
    const item = history.find((x) => x.id === id);
    if (!item) return sendJson(res, 404, { error: "Version introuvable." });
    logActivity(user, "cv.history.get", { versionId: id });
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
