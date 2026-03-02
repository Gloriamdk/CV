const state = {
  token: localStorage.getItem("mycv_token") || "",
  template: localStorage.getItem("mycv_template") || "professional",
  user: null,
  cvData: {
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
  },
};

const el = {
  authEmail: document.getElementById("authEmail"),
  authName: document.getElementById("authName"),
  authPassword: document.getElementById("authPassword"),
  authStatus: document.getElementById("authStatus"),
  registerBtn: document.getElementById("registerBtn"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  improveFocus: document.getElementById("improveFocus"),
  file: document.getElementById("cvFile"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  saveBtn: document.getElementById("saveBtn"),
  jsonBtn: document.getElementById("jsonBtn"),
  docBtn: document.getElementById("docBtn"),
  pdfBtn: document.getElementById("pdfBtn"),
  templateSelect: document.getElementById("templateSelect"),
  improveBtn: document.getElementById("improveBtn"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  saveNote: document.getElementById("saveNote"),
  improveStatus: document.getElementById("improveStatus"),
  historyList: document.getElementById("historyList"),
  status: document.getElementById("status"),
  fullName: document.getElementById("fullName"),
  email: document.getElementById("email"),
  phone: document.getElementById("phone"),
  location: document.getElementById("location"),
  linkedin: document.getElementById("linkedin"),
  website: document.getElementById("website"),
  profile: document.getElementById("profile"),
  experience: document.getElementById("experience"),
  education: document.getElementById("education"),
  skills: document.getElementById("skills"),
  projects: document.getElementById("projects"),
  certifications: document.getElementById("certifications"),
  languages: document.getElementById("languages"),
  interests: document.getElementById("interests"),
  other: document.getElementById("other"),
};

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("error", Boolean(isError));
}

function setAuthStatus(message, isError = false) {
  el.authStatus.textContent = message;
  el.authStatus.classList.toggle("error", Boolean(isError));
}

function setImproveStatus(message, isError = false) {
  el.improveStatus.textContent = message;
  el.improveStatus.classList.toggle("error", Boolean(isError));
}

function applyTemplate(templateName) {
  const allowed = ["professional", "modern", "minimal"];
  const selected = allowed.includes(templateName) ? templateName : "professional";
  state.template = selected;
  document.body.setAttribute("data-template", selected);
  if (el.templateSelect.value !== selected) {
    el.templateSelect.value = selected;
  }
  localStorage.setItem("mycv_template", selected);
}

function withAuth(headers = {}) {
  const h = { ...headers };
  if (state.token) h.Authorization = `Bearer ${state.token}`;
  return h;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: withAuth({ "Content-Type": "application/json", ...(options.headers || {}) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Erreur API.");
  return data;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : "");
    };
    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.readAsDataURL(file);
  });
}

function arrayToText(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function textToArray(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function syncStateToForm() {
  const c = state.cvData.candidate;
  const s = state.cvData.sections;
  el.fullName.value = c.fullName || "";
  el.email.value = c.email || "";
  el.phone.value = c.phone || "";
  el.location.value = c.location || "";
  el.linkedin.value = c.linkedin || "";
  el.website.value = c.website || "";
  el.profile.value = s.profile || "";
  el.experience.value = arrayToText(s.experience);
  el.education.value = arrayToText(s.education);
  el.skills.value = arrayToText(s.skills);
  el.projects.value = arrayToText(s.projects);
  el.certifications.value = arrayToText(s.certifications);
  el.languages.value = arrayToText(s.languages);
  el.interests.value = arrayToText(s.interests);
  el.other.value = arrayToText(s.other);
}

function syncFormToState() {
  state.cvData = {
    candidate: {
      fullName: el.fullName.value.trim(),
      email: el.email.value.trim(),
      phone: el.phone.value.trim(),
      location: el.location.value.trim(),
      linkedin: el.linkedin.value.trim(),
      website: el.website.value.trim(),
    },
    sections: {
      profile: el.profile.value.trim(),
      experience: textToArray(el.experience.value),
      education: textToArray(el.education.value),
      skills: textToArray(el.skills.value),
      projects: textToArray(el.projects.value),
      certifications: textToArray(el.certifications.value),
      languages: textToArray(el.languages.value),
      interests: textToArray(el.interests.value),
      other: textToArray(el.other.value),
    },
  };
}

async function register() {
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: el.authEmail.value.trim(),
        name: el.authName.value.trim(),
        password: el.authPassword.value,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("mycv_token", state.token);
    setAuthStatus(`Connecte: ${data.user.email}`);
    await loadHistory();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function login() {
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: el.authEmail.value.trim(),
        password: el.authPassword.value,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("mycv_token", state.token);
    setAuthStatus(`Connecte: ${data.user.email}`);
    await loadHistory();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function logout() {
  try {
    if (state.token) {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    }
  } catch {}
  state.token = "";
  state.user = null;
  localStorage.removeItem("mycv_token");
  el.historyList.innerHTML = "";
  setAuthStatus("Non connecte.");
}

async function whoAmI() {
  if (!state.token) return;
  try {
    const data = await api("/api/auth/me", { method: "GET", headers: {} });
    state.user = data.user;
    setAuthStatus(`Connecte: ${data.user.email}`);
    await loadHistory();
  } catch {
    state.token = "";
    localStorage.removeItem("mycv_token");
    setAuthStatus("Session expiree. Reconnecte-toi.", true);
  }
}

async function analyzeFile() {
  const file = el.file.files?.[0];
  if (!file) return setStatus("Choisis un fichier CV avant l'analyse.", true);
  if (file.size > 8 * 1024 * 1024) return setStatus("Le fichier est trop lourd (max 8MB).", true);

  try {
    setStatus("Lecture du fichier...");
    const base64Data = await readFileAsBase64(file);
    setStatus("Analyse IA en cours...");
    const data = await api("/api/cv/analyze", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        base64Data,
        language: "fr",
      }),
    });
    state.cvData = data.cvData || state.cvData;
    syncStateToForm();
    if (data.fallback) {
      setStatus(data.warning || "Analyse en fallback.", true);
    } else {
      setStatus(`Analyse terminee pour ${file.name}.`);
    }
  } catch (error) {
    setStatus(error.message || "Erreur d'analyse.", true);
  }
}

async function improveCv() {
  if (!state.token) return setImproveStatus("Connecte-toi pour utiliser l'amelioration IA.", true);
  try {
    syncFormToState();
    setImproveStatus("Amelioration en cours...");
    const data = await api("/api/cv/improve", {
      method: "POST",
      body: JSON.stringify({
        cvData: state.cvData,
        focus: el.improveFocus.value.trim(),
      }),
    });
    state.cvData = data.cvData || state.cvData;
    syncStateToForm();
    const suggestions = Array.isArray(data.suggestions) && data.suggestions.length
      ? `Suggestions: ${data.suggestions.join(" | ")}`
      : data.message;
    setImproveStatus(data.warning ? `${data.warning} ${suggestions}` : suggestions, Boolean(data.warning));
  } catch (error) {
    setImproveStatus(error.message || "Echec amelioration.", true);
  }
}

async function saveCv() {
  if (!state.token) return setStatus("Connecte-toi avant de sauvegarder une version.", true);
  try {
    syncFormToState();
    setStatus("Sauvegarde en cours...");
    const data = await api("/api/cv/save", {
      method: "PUT",
      body: JSON.stringify({ cvData: state.cvData, note: el.saveNote.value.trim() }),
    });
    setStatus(`Version sauvegardee (${data.version.id.slice(0, 8)}).`);
    el.saveNote.value = "";
    await loadHistory();
  } catch (error) {
    setStatus(error.message || "Echec sauvegarde.", true);
  }
}

async function loadHistory() {
  if (!state.token) return;
  try {
    const data = await api("/api/cv/history", { method: "GET", headers: {} });
    renderHistory(data.history || []);
  } catch (error) {
    setStatus(error.message || "Impossible de charger l'historique.", true);
  }
}

function renderHistory(items) {
  if (!items.length) {
    el.historyList.innerHTML = "<p class='muted'>Aucune version pour le moment.</p>";
    return;
  }
  el.historyList.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    const note = item.note ? ` - ${item.note}` : "";
    button.textContent = `${new Date(item.createdAt).toLocaleString()} - ${item.title}${note}`;
    button.addEventListener("click", async () => {
      try {
        const data = await api(`/api/cv/history/${encodeURIComponent(item.id)}`, {
          method: "GET",
          headers: {},
        });
        state.cvData = data.version.cvData;
        syncStateToForm();
        setStatus(`Version chargee: ${item.id.slice(0, 8)}.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    el.historyList.appendChild(button);
  });
}

function downloadJson() {
  syncFormToState();
  const blob = new Blob([JSON.stringify(state.cvData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mycv-edited.json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Fichier JSON telecharge.");
}

function getExportTheme(templateName) {
  if (templateName === "modern") {
    return {
      font: "'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
      ink: "#16212d",
      sub: "#35506d",
      line: "#83b0dd",
      accentBg: "linear-gradient(90deg, #ecf4ff, #ffffff)",
    };
  }
  if (templateName === "minimal") {
    return {
      font: "Cambria, Georgia, serif",
      ink: "#1f1f1f",
      sub: "#4f4f4f",
      line: "#cfcfcf",
      accentBg: "transparent",
    };
  }
  return {
    font: "Calibri, Arial, sans-serif",
    ink: "#1e1e1e",
    sub: "#3f3f3f",
    line: "#d7d7d7",
    accentBg: "linear-gradient(90deg, #f3f8f5, #ffffff)",
  };
}

function cvToHtml(cvData, templateName = "professional") {
  const theme = getExportTheme(templateName);
  const esc = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const block = (title, list) => {
    const items = (list || []).map((x) => `<li>${esc(x)}</li>`).join("");
    return items ? `<h3>${esc(title)}</h3><ul>${items}</ul>` : "";
  };
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CV ${esc(cvData.candidate.fullName)}</title>
  <style>
    body { font-family: ${theme.font}; margin: 24px; color: ${theme.ink}; line-height: 1.35; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    h2 { margin: 0 0 14px; font-size: 14px; font-weight: 500; color: ${theme.sub}; }
    h3 { margin: 18px 0 6px; font-size: 16px; border-bottom: 1px solid ${theme.line}; padding-bottom: 3px; background: ${theme.accentBg}; }
    ul { margin: 6px 0 0 18px; }
    p { margin: 8px 0; }
    .meta span { margin-right: 10px; }
  </style>
</head>
<body>
  <h1>${esc(cvData.candidate.fullName || "Candidat")}</h1>
  <h2 class="meta">
    <span>${esc(cvData.candidate.email)}</span>
    <span>${esc(cvData.candidate.phone)}</span>
    <span>${esc(cvData.candidate.location)}</span>
    <span>${esc(cvData.candidate.linkedin)}</span>
    <span>${esc(cvData.candidate.website)}</span>
  </h2>
  ${cvData.sections.profile ? `<h3>Profil</h3><p>${esc(cvData.sections.profile)}</p>` : ""}
  ${block("Formation", cvData.sections.education)}
  ${block("Experience", cvData.sections.experience)}
  ${block("Competences", cvData.sections.skills)}
  ${block("Projets", cvData.sections.projects)}
  ${block("Certifications", cvData.sections.certifications)}
  ${block("Langues", cvData.sections.languages)}
  ${block("Interets", cvData.sections.interests)}
  ${block("Autre", cvData.sections.other)}
</body>
</html>`;
}

function exportDoc() {
  syncFormToState();
  const html = cvToHtml(state.cvData, state.template);
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(state.cvData.candidate.fullName || "cv").replace(/\s+/g, "_")}.doc`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Export Word termine.");
}

function exportPdf() {
  syncFormToState();
  const html = cvToHtml(state.cvData, state.template);
  const win = window.open("", "_blank");
  if (!win) {
    setStatus("Popup bloquee: autorise les popups pour exporter PDF.", true);
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 250);
  setStatus("Fenetre d'impression ouverte. Choisis 'Save as PDF'.");
}

el.registerBtn.addEventListener("click", register);
el.loginBtn.addEventListener("click", login);
el.logoutBtn.addEventListener("click", logout);
el.analyzeBtn.addEventListener("click", analyzeFile);
el.improveBtn.addEventListener("click", improveCv);
el.saveBtn.addEventListener("click", saveCv);
el.refreshHistoryBtn.addEventListener("click", loadHistory);
el.jsonBtn.addEventListener("click", downloadJson);
el.docBtn.addEventListener("click", exportDoc);
el.pdfBtn.addEventListener("click", exportPdf);
el.templateSelect.addEventListener("change", () => applyTemplate(el.templateSelect.value));

syncStateToForm();
applyTemplate(state.template);
whoAmI();
