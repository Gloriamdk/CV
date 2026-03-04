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
const LOCAL_HISTORY_KEY = "mycv_local_history_v1";

const el = {
  authEmail: document.getElementById("authEmail"),
  authName: document.getElementById("authName"),
  authPassword: document.getElementById("authPassword"),
  authStatus: document.getElementById("authStatus"),
  registerBtn: document.getElementById("registerBtn"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  file: document.getElementById("cvFile"),
  photoInput: document.getElementById("photoInput"),
  photoPreview: document.getElementById("photoPreview"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  previewBtn: document.getElementById("previewBtn"),
  saveBtn: document.getElementById("saveBtn"),
  docBtn: document.getElementById("docBtn"),
  pdfBtn: document.getElementById("pdfBtn"),
  templateSelect: document.getElementById("templateSelect"),
  tplProfessional: document.getElementById("tplProfessional"),
  tplModern: document.getElementById("tplModern"),
  tplMinimal: document.getElementById("tplMinimal"),
  templatePreview: document.getElementById("templatePreview"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  saveNote: document.getElementById("saveNote"),
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

function localHistoryKeyForUserId(userId) {
  return userId ? `${LOCAL_HISTORY_KEY}_${userId}` : `${LOCAL_HISTORY_KEY}_guest`;
}

function currentLocalHistoryKey() {
  return localHistoryKeyForUserId(state.user?.id || "");
}

function readLocalHistory(userId = null) {
  try {
    const key = userId === null ? currentLocalHistoryKey() : localHistoryKeyForUserId(userId);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(items, userId = null) {
  const key = userId === null ? currentLocalHistoryKey() : localHistoryKeyForUserId(userId);
  localStorage.setItem(key, JSON.stringify(items.slice(0, 50)));
}

async function syncLocalHistoryToAccount() {
  if (!state.token || !state.user?.id) return;
  const guestItems = readLocalHistory("");
  const userItems = readLocalHistory(state.user.id);
  const localItems = [...guestItems, ...userItems];
  if (!localItems.length) return;
  try {
    for (const item of localItems) {
      await api("/api/cv/save", {
        method: "PUT",
        body: JSON.stringify({
          cvData: item.cvData || state.cvData,
          note: item.note || "Imported from local history",
        }),
      });
    }
    localStorage.removeItem(localHistoryKeyForUserId(""));
    localStorage.removeItem(localHistoryKeyForUserId(state.user.id));
    setStatus("Historique local synchronise sur ton compte.");
  } catch {
    setStatus("Connexion OK, mais la synchronisation locale a echoue.", true);
  }
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
    await syncLocalHistoryToAccount();
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
    await syncLocalHistoryToAccount();
    await loadHistory();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function logout() {
  try {
    if (state.token) await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  const empty = {
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
  };
  state.token = "";
  state.user = null;
  state.cvData = empty;
  syncStateToForm();
  localStorage.removeItem("mycv_token");
  setAuthStatus("Non connecte.");
  await loadHistory();
}

async function whoAmI() {
  if (!state.token) {
    setAuthStatus("Non connecte. Mode local actif.");
    await loadHistory();
    return;
  }
  try {
    const data = await api("/api/auth/me", { method: "GET", headers: {} });
    state.user = data.user;
    setAuthStatus(`Connecte: ${data.user.email}`);
    await syncLocalHistoryToAccount();
    await loadHistory();
  } catch {
    state.token = "";
    localStorage.removeItem("mycv_token");
    setAuthStatus("Session expiree. Mode local actif.", true);
    await loadHistory();
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

async function saveCv() {
  syncFormToState();
  const note = el.saveNote.value.trim();
  const localItem = {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    note,
    title: state.cvData?.candidate?.fullName || "CV sans nom",
    cvData: state.cvData,
    local: true,
  };

  if (!state.token) {
    const history = readLocalHistory();
    history.unshift(localItem);
    writeLocalHistory(history);
    setStatus(`Version locale sauvegardee (${localItem.id.slice(0, 8)}).`);
    el.saveNote.value = "";
    await loadHistory();
    return;
  }

  try {
    setStatus("Sauvegarde en cours...");
    const data = await api("/api/cv/save", {
      method: "PUT",
      body: JSON.stringify({ cvData: state.cvData, note }),
    });
    setStatus(`Version sauvegardee (${data.version.id.slice(0, 8)}).`);
    el.saveNote.value = "";
    await loadHistory();
  } catch {
    const history = readLocalHistory();
    history.unshift(localItem);
    writeLocalHistory(history);
    setStatus(`API indisponible: version locale sauvegardee (${localItem.id.slice(0, 8)}).`, true);
    el.saveNote.value = "";
    await loadHistory();
  }
}

async function loadHistory() {
  if (!state.token) {
    renderHistory(readLocalHistory());
    return;
  }
  try {
    const data = await api("/api/cv/history", { method: "GET", headers: {} });
    renderHistory(data.history || []);
  } catch {
    renderHistory(readLocalHistory(state.user?.id || ""));
    setStatus("Historique distant indisponible: affichage local du compte courant.", true);
  }
}

function renderHistory(items) {
  if (!items.length) {
    el.historyList.innerHTML = "<p class='muted'>Aucune version pour le moment.</p>";
    return;
  }
  el.historyList.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "history-item";
    const title = document.createElement("div");
    title.className = "history-title";
    const note = item.note ? ` - ${item.note}` : "";
    title.textContent = `${new Date(item.createdAt).toLocaleString()} - ${item.title}${note}`;
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "secondary";
    viewBtn.textContent = "Voir";
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Charger";

    viewBtn.addEventListener("click", async () => {
      if (item.local && item.cvData) {
        const html = cvToHtml(item.cvData, state.template);
        const win = window.open("", "_blank");
        if (!win) return setStatus("Popup bloquee: autorise les popups pour visualiser le CV.", true);
        win.document.write(html);
        win.document.close();
        win.focus();
        setStatus(`Apercu ouvert pour la version ${item.id.slice(0, 8)}.`);
        return;
      }
      try {
        const data = await api(`/api/cv/history/${encodeURIComponent(item.id)}`, { method: "GET", headers: {} });
        const html = cvToHtml(data.version.cvData, state.template);
        const win = window.open("", "_blank");
        if (!win) return setStatus("Popup bloquee: autorise les popups pour visualiser le CV.", true);
        win.document.write(html);
        win.document.close();
        win.focus();
        setStatus(`Apercu ouvert pour la version ${item.id.slice(0, 8)}.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    loadBtn.addEventListener("click", async () => {
      if (item.local && item.cvData) {
        state.cvData = item.cvData;
        syncStateToForm();
        setStatus(`Version locale chargee: ${item.id.slice(0, 8)}. Tu peux modifier puis sauvegarder.`);
        return;
      }
      try {
        const data = await api(`/api/cv/history/${encodeURIComponent(item.id)}`, { method: "GET", headers: {} });
        state.cvData = data.version.cvData;
        syncStateToForm();
        setStatus(`Version chargee: ${item.id.slice(0, 8)}. Tu peux modifier puis sauvegarder.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    actions.appendChild(viewBtn);
    actions.appendChild(loadBtn);
    card.appendChild(title);
    card.appendChild(actions);
    el.historyList.appendChild(card);
  });
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

function profileTagline(cvData) {
  const fromProfile = String(cvData?.sections?.profile || "").split(/[.!?\n]/)[0].trim();
  if (fromProfile) return fromProfile.slice(0, 80);
  return "Professional Profile";
}

function renderTemplateProfessional(cvData) {
  const c = cvData.candidate;
  const contacts = contactItems(c);
  return `
  <div class="doc pro">
    <header class="doc-head">
      <div class="head-wrap">
        ${c.photoDataUrl ? `<img src="${c.photoDataUrl}" class="photo photo-head-left" alt="photo" />` : ""}
        <div class="head-text">
          <h1>${esc(c.fullName || "Votre Nom")}</h1>
          <p>${esc(profileTagline(cvData))}</p>
        </div>
      </div>
    </header>
    <aside class="side">
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
        <h1>${esc(c.fullName || "Votre Nom")}</h1>
        <p class="tag">${esc(profileTagline(cvData))}</p>
      </div>
    </div>
    <div class="grid">
      <main>
        ${textBlock("Profil", cvData.sections.profile)}
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
    <header class="doc-head">
      <div class="head-wrap">
        <div class="head-text">
          <h1>${esc(c.fullName || "Votre Nom")}</h1>
          <p>${esc(profileTagline(cvData))}</p>
        </div>
        ${c.photoDataUrl ? `<img src="${c.photoDataUrl}" class="photo photo-head-right" alt="photo" />` : ""}
      </div>
    </header>
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
    @page { size: A4; margin: 8mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; color: #1f2023; background: #fff; font-family: "Trebuchet MS", "Segoe UI", Tahoma, sans-serif; }
    h1 { margin: 0; font-size: 32px; letter-spacing: .02em; line-height: 1.1; font-family: "Palatino Linotype", "Book Antiqua", Georgia, serif; }
    h3 { margin: 0 0 8px; text-transform: uppercase; letter-spacing: .14em; font-size: 10.5px; font-weight: 700; }
    p { margin: 0 0 9px; line-height: 1.5; }
    ul { margin: 0; padding-left: 17px; }
    li { margin-bottom: 5px; line-height: 1.4; }
    section { margin-bottom: 14px; break-inside: avoid; }
    .photo { width: 108px; height: 108px; object-fit: cover; border-radius: 14px; margin-bottom: 12px; }
    .doc { border-radius: 8px; overflow: hidden; border: 1px solid #e4e6ea; background: #fff; }
    .doc-head { grid-column: 1 / -1; padding: 20px 22px 12px; border-bottom: 1px solid #eceef2; }
    .head-wrap { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .head-text { flex: 1; min-width: 0; }
    .photo-head-left, .photo-head-right { width: 86px; height: 86px; border-radius: 50%; margin: 0; object-fit: cover; }
    .photo-head-left { border: 2px solid #dce4ef; }
    .photo-head-right { border: 2px solid #e5dfd4; }
    .doc-head p { color: #545d66; font-weight: 600; margin-top: 4px; font-size: 13px; }
    .doc section h3 { color: #37424f; }

    .doc.pro { display: grid; grid-template-columns: 31% 1fr; min-height: 100vh; }
    .doc.pro .doc-head { background: linear-gradient(180deg, #f8f8fa, #ffffff); }
    .doc.pro .side { padding: 20px 18px; background: #1f2630; color: #eef1f5; }
    .doc.pro .side section { margin-bottom: 16px; }
    .doc.pro .side h3 { color: #f8fbff; border-bottom: 1px solid rgba(255,255,255,.26); padding-bottom: 6px; }
    .doc.pro .side li { color: #dfe5ec; }
    .doc.pro .main { padding: 20px 22px; background: #fff; }
    .doc.pro .main h3 { border-bottom: 1px solid #e7ebf0; padding-bottom: 4px; }

    .doc.modern { border-color: #d8e6e7; }
    .doc.modern .topband {
      background: linear-gradient(105deg, #173f47 0%, #2f6f74 65%, #3f8f96 100%);
      color: #fff;
      padding: 18px;
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 14px;
      align-items: center;
    }
    .doc.modern .toptext h1 { color: #fff; font-size: 34px; }
    .doc.modern .topband .tag { font-size: 14px; opacity: .92; margin-top: 5px; color: #daf3f5; }
    .doc.modern .grid { display: grid; grid-template-columns: 1fr 35%; gap: 16px; padding: 16px; background: linear-gradient(180deg, #ffffff, #f8fbfb); }
    .doc.modern main h3 { color: #275157; border-bottom: 1px solid #d7e7e9; padding-bottom: 4px; }
    .doc.modern aside { background: #eaf4f5; padding: 12px; border-radius: 12px; border: 1px solid #d4e5e7; }
    .doc.modern aside h3 { color: #2f5860; }
    .doc.modern .photo-square { border-radius: 18px; border: 2px solid #d8f0f2; }
    .chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .chip { background: #d5eaed; border: 1px solid #9ec7cd; border-radius: 999px; padding: 3px 9px; font-size: 11px; color: #24474d; }

    .doc.minimal {
      padding: 18px 22px;
      font-family: "Book Antiqua", Georgia, serif;
      background:
        linear-gradient(180deg, #fffefc 0%, #ffffff 24%),
        repeating-linear-gradient(0deg, rgba(0,0,0,0.012) 0, rgba(0,0,0,0.012) 1px, transparent 1px, transparent 28px);
    }
    .doc.minimal .doc-head { padding: 4px 0 14px; border-bottom: 1px solid #ddd7cd; margin-bottom: 12px; }
    .doc.minimal .doc-head p { color: #5d574f; }
    .doc.minimal h3 { border-bottom: 1px solid #ddd7cd; padding-bottom: 4px; color: #4e453a; }
    .doc.minimal p, .doc.minimal li { color: #2e2a25; }
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

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (window.html2pdf) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Impossible de charger la librairie PDF.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger la librairie PDF."));
    document.head.appendChild(script);
  });
}

async function exportPdf() {
  syncFormToState();
  try {
    setStatus("Preparation du PDF...");
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
    const html = cvToHtml(state.cvData, state.template);
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/i);
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-99999px";
    container.style.top = "0";
    container.style.width = "794px";
    const styleTag = document.createElement("style");
    styleTag.textContent = styleMatch?.[1] || "";
    container.appendChild(styleTag);
    const content = document.createElement("div");
    content.innerHTML = bodyMatch?.[1] || "";
    container.appendChild(content);
    document.body.appendChild(container);

    const fileName = `${(state.cvData.candidate.fullName || "cv").replace(/\s+/g, "_")}.pdf`;
    await window.html2pdf()
      .from(container)
      .set({
        margin: 0,
        filename: fileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .save();

    container.remove();
    setStatus("Export PDF termine.");
  } catch (error) {
    setStatus(error.message || "Echec export PDF.", true);
  }
}

function previewCv() {
  syncFormToState();
  const html = cvToHtml(state.cvData, state.template);
  const win = window.open("", "_blank");
  if (!win) return setStatus("Popup bloquee: autorise les popups pour visualiser le CV.", true);
  win.document.write(html);
  win.document.close();
  win.focus();
  setStatus("Apercu ouvert dans un nouvel onglet.");
}

el.registerBtn.addEventListener("click", register);
el.loginBtn.addEventListener("click", login);
el.logoutBtn.addEventListener("click", logout);
el.analyzeBtn.addEventListener("click", analyzeFile);
el.photoInput.addEventListener("change", handlePhotoUpload);
el.previewBtn.addEventListener("click", previewCv);
el.saveBtn.addEventListener("click", saveCv);
el.refreshHistoryBtn.addEventListener("click", loadHistory);
el.docBtn.addEventListener("click", exportDoc);
el.pdfBtn.addEventListener("click", exportPdf);
el.templateSelect.addEventListener("change", () => applyTemplate(el.templateSelect.value));
el.tplProfessional.addEventListener("click", () => applyTemplate("professional"));
el.tplModern.addEventListener("click", () => applyTemplate("modern"));
el.tplMinimal.addEventListener("click", () => applyTemplate("minimal"));

syncStateToForm();
applyTemplate(state.template);
whoAmI();
