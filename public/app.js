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
      photoDataUrl: "",
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
  photoInput: document.getElementById("photoInput"),
  photoPreview: document.getElementById("photoPreview"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  saveBtn: document.getElementById("saveBtn"),
  jsonBtn: document.getElementById("jsonBtn"),
  docBtn: document.getElementById("docBtn"),
  pdfBtn: document.getElementById("pdfBtn"),
  templateSelect: document.getElementById("templateSelect"),
  tplProfessional: document.getElementById("tplProfessional"),
  tplModern: document.getElementById("tplModern"),
  tplMinimal: document.getElementById("tplMinimal"),
  templatePreview: document.getElementById("templatePreview"),
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

function setTemplateCardActive(selected) {
  [el.tplProfessional, el.tplModern, el.tplMinimal].forEach((card) => {
    if (!card) return;
    card.classList.toggle("active", card.dataset.template === selected);
  });
}

function applyTemplate(templateName) {
  const allowed = ["professional", "modern", "minimal"];
  const selected = allowed.includes(templateName) ? templateName : "professional";
  state.template = selected;
  document.body.setAttribute("data-template", selected);
  el.templateSelect.value = selected;
  setTemplateCardActive(selected);
  localStorage.setItem("mycv_template", selected);
  updateTemplatePreview(selected);
}

function getPreviewMarkup(template) {
  const builds = {
    professional: [
      { title: "En-tête", text: "Gradient, colonnes, information credentials" },
      { title: "Formation", text: "LBS, 2024" },
      { title: "Experience", text: "Design Systems, Chef de projet" },
    ],
    modern: [
      { title: "Profil", text: "Sidebar colorée + sections texturées" },
      { title: "Experience", text: "Lead product, 3 projets" },
      { title: "Compétences", text: "UI / UX / Research" },
    ],
    minimal: [
      { title: "Profil", text: "Typo serif, blocs lisibles" },
      { title: "Experience", text: "Consulting, Finance" },
      { title: "Competences", text: "Strategy, Analytics" },
    ],
  };
  const stack = builds[template] || builds.professional;
  const items = stack
    .map((entry) => `<div class="block"><strong>${entry.title}</strong><span>${entry.text}</span></div>`)
    .join("");
  return `<div class="preview-layout">${items}</div>`;
}

function updateTemplatePreview(template) {
  if (!el.templatePreview) return;
  el.templatePreview.innerHTML = getPreviewMarkup(template);
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire l'image."));
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
  el.education.value = arrayToText(s.education);
  el.experience.value = arrayToText(s.experience);
  el.skills.value = arrayToText(s.skills);
  el.projects.value = arrayToText(s.projects);
  el.certifications.value = arrayToText(s.certifications);
  el.languages.value = arrayToText(s.languages);
  el.interests.value = arrayToText(s.interests);
  el.other.value = arrayToText(s.other);
  const img = c.photoDataUrl || "";
  el.photoPreview.src = img;
  el.photoPreview.classList.toggle("visible", Boolean(img));
}

function syncFormToState() {
  const photoDataUrl = state.cvData?.candidate?.photoDataUrl || "";
  state.cvData = {
    candidate: {
      fullName: el.fullName.value.trim(),
      email: el.email.value.trim(),
      phone: el.phone.value.trim(),
      location: el.location.value.trim(),
      linkedin: el.linkedin.value.trim(),
      website: el.website.value.trim(),
      photoDataUrl,
    },
    sections: {
      profile: el.profile.value.trim(),
      education: textToArray(el.education.value),
      experience: textToArray(el.experience.value),
      skills: textToArray(el.skills.value),
      projects: textToArray(el.projects.value),
      certifications: textToArray(el.certifications.value),
      languages: textToArray(el.languages.value),
      interests: textToArray(el.interests.value),
      other: textToArray(el.other.value),
    },
  };
}

async function handlePhotoUpload() {
  const file = el.photoInput.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) return setStatus("Photo trop lourde (max 3MB).", true);
  try {
    const dataUrl = await readFileAsDataUrl(file);
    state.cvData.candidate.photoDataUrl = dataUrl;
    syncStateToForm();
    setStatus("Photo ajoutee au CV.");
  } catch (error) {
    setStatus(error.message || "Erreur ajout photo.", true);
  }
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
    if (state.token) await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
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
    const previousPhoto = state.cvData?.candidate?.photoDataUrl || "";
    state.cvData = data.cvData || state.cvData;
    if (!state.cvData.candidate.photoDataUrl && previousPhoto) {
      state.cvData.candidate.photoDataUrl = previousPhoto;
    }
    syncStateToForm();
    if (data.fallback) {
      const warning = data.warning || "Analyse en fallback.";
      const details = data.aiError ? ` Detail: ${String(data.aiError).slice(0, 220)}` : "";
      setStatus(`${warning}${details}`, true);
    } else {
      setStatus(`Analyse terminee pour ${file.name}.`, false);
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
      body: JSON.stringify({ cvData: state.cvData, focus: el.improveFocus.value.trim() }),
    });
    const currentPhoto = state.cvData?.candidate?.photoDataUrl || "";
    state.cvData = data.cvData || state.cvData;
    if (!state.cvData.candidate.photoDataUrl && currentPhoto) {
      state.cvData.candidate.photoDataUrl = currentPhoto;
    }
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
        const data = await api(`/api/cv/history/${encodeURIComponent(item.id)}`, { method: "GET", headers: {} });
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

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function listBlock(title, list) {
  const items = (list || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return items ? `<section><h3>${esc(title)}</h3><ul>${items}</ul></section>` : "";
}

function textBlock(title, text) {
  return text ? `<section><h3>${esc(title)}</h3><p>${esc(text)}</p></section>` : "";
}

function contactItems(candidate) {
  return [candidate.email, candidate.phone, candidate.location, candidate.linkedin, candidate.website].filter(Boolean);
}

function renderTemplateProfessional(cvData) {
  const c = cvData.candidate;
  const contacts = contactItems(c);
  return `
  <div class="doc pro">
    <aside class="side">
      ${c.photoDataUrl ? `<img src="${c.photoDataUrl}" class="photo" alt="photo" />` : ""}
      ${contacts.length ? `<section><h3>Contact</h3><ul>${contacts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
      ${listBlock("Competences", cvData.sections.skills)}
      ${listBlock("Langues", cvData.sections.languages)}
      ${listBlock("Certifications", cvData.sections.certifications)}
    </aside>
    <main class="main">
      ${textBlock("Profil", cvData.sections.profile)}
      ${listBlock("Formation", cvData.sections.education)}
      ${listBlock("Experience", cvData.sections.experience)}
      ${listBlock("Projets", cvData.sections.projects)}
      ${listBlock("Interets", cvData.sections.interests)}
      ${listBlock("Autre", cvData.sections.other)}
    </main>
  </div>`;
}

function renderTemplateModern(cvData) {
  const c = cvData.candidate;
  const contacts = contactItems(c);
  const chips = (cvData.sections.skills || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("");
  return `
  <div class="doc modern">
    <div class="topband">
      ${c.photoDataUrl ? `<img src="${c.photoDataUrl}" class="photo photo-square" alt="photo" />` : ""}
      <div class="toptext">
        ${textBlock("Profil", cvData.sections.profile)}
      </div>
    </div>
    <div class="grid">
      <main>
        ${listBlock("Formation", cvData.sections.education)}
        ${listBlock("Experience", cvData.sections.experience)}
        ${listBlock("Projets", cvData.sections.projects)}
      </main>
      <aside>
        ${contacts.length ? `<section><h3>Contact</h3><ul>${contacts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
        ${chips ? `<section><h3>Competences</h3><div class="chips">${chips}</div></section>` : ""}
        ${listBlock("Langues", cvData.sections.languages)}
        ${listBlock("Certifications", cvData.sections.certifications)}
        ${listBlock("Interets", cvData.sections.interests)}
        ${listBlock("Autre", cvData.sections.other)}
      </aside>
    </div>
  </div>`;
}

function renderTemplateMinimal(cvData) {
  const c = cvData.candidate;
  const contacts = contactItems(c);
  return `
  <div class="doc minimal">
    ${c.photoDataUrl ? `<img src="${c.photoDataUrl}" class="photo photo-float" alt="photo" />` : ""}
    ${contacts.length ? `<section><h3>Contact</h3><p>${contacts.map((x) => esc(x)).join(" | ")}</p></section>` : ""}
    ${textBlock("Profil", cvData.sections.profile)}
    ${listBlock("Formation", cvData.sections.education)}
    ${listBlock("Experience", cvData.sections.experience)}
    ${listBlock("Competences", cvData.sections.skills)}
    ${listBlock("Projets", cvData.sections.projects)}
    ${listBlock("Certifications", cvData.sections.certifications)}
    ${listBlock("Langues", cvData.sections.languages)}
    ${listBlock("Interets", cvData.sections.interests)}
    ${listBlock("Autre", cvData.sections.other)}
  </div>`;
}

function cvToHtml(cvData, templateName = "professional") {
  const layout =
    templateName === "modern"
      ? renderTemplateModern(cvData)
      : templateName === "minimal"
      ? renderTemplateMinimal(cvData)
      : renderTemplateProfessional(cvData);

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CV</title>
  <style>
    @page { margin: 10mm; }
    body { margin: 0; color: #1f1f1f; background: #fff; font-family: Arial, sans-serif; }
    h3 { margin: 0 0 6px; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
    p { margin: 0 0 8px; line-height: 1.45; }
    ul { margin: 0; padding-left: 17px; }
    li { margin-bottom: 4px; line-height: 1.35; }
    section { margin-bottom: 12px; break-inside: avoid; }
    .photo { width: 110px; height: 110px; object-fit: cover; border-radius: 10px; margin-bottom: 10px; }
    .doc.pro { display: grid; grid-template-columns: 34% 1fr; min-height: 100vh; }
    .doc.pro .side { padding: 18px; background: #f3f7f5; border-right: 1px solid #d8e0db; }
    .doc.pro .main { padding: 20px; }
    .doc.modern .topband { background: linear-gradient(90deg, #173757, #2c6aa8); color: #fff; padding: 16px; display: grid; grid-template-columns: 120px 1fr; gap: 12px; }
    .doc.modern .topband h3 { color: #d8ecff; }
    .doc.modern .grid { display: grid; grid-template-columns: 1fr 36%; gap: 14px; padding: 14px; }
    .doc.modern aside { background: #f0f7ff; padding: 10px; border-radius: 10px; }
    .doc.modern .photo-square { border-radius: 14px; border: 2px solid #fff; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { background: #d4e9ff; border: 1px solid #9ac4ef; border-radius: 999px; padding: 3px 8px; font-size: 11px; }
    .doc.minimal { padding: 18px; font-family: Georgia, 'Times New Roman', serif; }
    .doc.minimal h3 { border-bottom: 1px solid #d8d8d8; padding-bottom: 4px; }
    .doc.minimal .photo-float { float: right; border-radius: 100px; margin-left: 12px; margin-bottom: 8px; width: 96px; height: 96px; }
  </style>
</head>
<body>
  ${layout}
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
  if (!win) return setStatus("Popup bloquee: autorise les popups pour exporter PDF.", true);
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
  setStatus("Impression ouverte. Decoche 'Headers and footers' pour enlever date/page.");
}

el.registerBtn.addEventListener("click", register);
el.loginBtn.addEventListener("click", login);
el.logoutBtn.addEventListener("click", logout);
el.analyzeBtn.addEventListener("click", analyzeFile);
el.photoInput.addEventListener("change", handlePhotoUpload);
el.improveBtn.addEventListener("click", improveCv);
el.saveBtn.addEventListener("click", saveCv);
el.refreshHistoryBtn.addEventListener("click", loadHistory);
el.jsonBtn.addEventListener("click", downloadJson);
el.docBtn.addEventListener("click", exportDoc);
el.pdfBtn.addEventListener("click", exportPdf);
el.templateSelect.addEventListener("change", () => applyTemplate(el.templateSelect.value));
el.tplProfessional.addEventListener("click", () => applyTemplate("professional"));
el.tplModern.addEventListener("click", () => applyTemplate("modern"));
el.tplMinimal.addEventListener("click", () => applyTemplate("minimal"));

syncStateToForm();
applyTemplate(state.template);
whoAmI();
