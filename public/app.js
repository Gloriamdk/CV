const state = {
  token: localStorage.getItem("mycv_token") || "",
  template: localStorage.getItem("mycv_template") || "professional",
  language: localStorage.getItem("mycv_language") || "fr",
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
  admin: {
    users: [],
    histories: [],
    logs: [],
  },
  authConfig: {
    allowPublicRegistration: true,
    adminLocalOnly: true,
  },
};
const LOCAL_HISTORY_KEY = "mycv_local_history_v1";
const IS_APP_PAGE = window.location.pathname.endsWith("/app.html");

function syncTokenFromStorage() {
  const latest = localStorage.getItem("mycv_token") || "";
  if (latest !== state.token) state.token = latest;
}

const el = {
  authEmail: document.getElementById("authEmail"),
  authName: document.getElementById("authName"),
  authPassword: document.getElementById("authPassword"),
  authStatus: document.getElementById("authStatus"),
  registerBtn: document.getElementById("registerBtn"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  adminLink: document.getElementById("adminLink"),
  file: document.getElementById("cvFile"),
  photoInput: document.getElementById("photoInput"),
  photoPreview: document.getElementById("photoPreview"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  languageSelect: document.getElementById("languageSelect"),
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
  adminPanel: document.getElementById("adminPanel"),
  adminKpiUsers: document.getElementById("adminKpiUsers"),
  adminKpiCv: document.getElementById("adminKpiCv"),
  adminKpiActions: document.getElementById("adminKpiActions"),
  adminKpiFallback: document.getElementById("adminKpiFallback"),
  adminNewName: document.getElementById("adminNewName"),
  adminNewEmail: document.getElementById("adminNewEmail"),
  adminNewPassword: document.getElementById("adminNewPassword"),
  adminNewRole: document.getElementById("adminNewRole"),
  adminCreateUserBtn: document.getElementById("adminCreateUserBtn"),
  adminRefreshBtn: document.getElementById("adminRefreshBtn"),
  adminStatus: document.getElementById("adminStatus"),
  adminUsersList: document.getElementById("adminUsersList"),
  adminUserSelect: document.getElementById("adminUserSelect"),
  adminLoadUserHistoryBtn: document.getElementById("adminLoadUserHistoryBtn"),
  adminUserHistory: document.getElementById("adminUserHistory"),
  adminActionFilter: document.getElementById("adminActionFilter"),
  adminLimitFilter: document.getElementById("adminLimitFilter"),
  adminLoadActivityBtn: document.getElementById("adminLoadActivityBtn"),
  adminActivityList: document.getElementById("adminActivityList"),
};

function setStatus(message, isError = false) {
  if (!el.status) return;
  el.status.textContent = message;
  el.status.classList.toggle("error", Boolean(isError));
}

function setAuthStatus(message, isError = false) {
  if (!el.authStatus) return;
  el.authStatus.textContent = message;
  el.authStatus.classList.toggle("error", Boolean(isError));
}

function setAdminStatus(message, isError = false) {
  if (!el.adminStatus) return;
  el.adminStatus.textContent = message;
  el.adminStatus.classList.toggle("error", Boolean(isError));
}

function isAdmin() {
  return String(state.user?.role || "") === "admin";
}

function setAdminVisibility() {
  if (!el.adminPanel) return;
  el.adminPanel.classList.add("hidden");
  if (el.adminLink) el.adminLink.classList.toggle("hidden", !isAdmin());
}

function applyAuthConfigUi() {
  if (!el.registerBtn) return;
  const allow = Boolean(state.authConfig?.allowPublicRegistration);
  el.registerBtn.disabled = !allow;
  el.registerBtn.title = allow ? "" : "Inscription publique desactivee. Utilise l'admin pour creer des comptes.";
}

function accountStatusMessage() {
  const status = String(state.user?.accountStatus || "ACTIVE");
  if (status === "PENDING") return "Votre compte est en attente de validation par l'administrateur.";
  if (status === "BLOCKED") return "Votre compte est bloque. Contacte l'administrateur.";
  return "";
}

function ensureActiveAccountForFeature() {
  const msg = accountStatusMessage();
  if (msg) {
    setStatus(msg, true);
    return false;
  }
  return true;
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

function applyLanguage(lang) {
  const allowed = ["fr", "en", "es", "de", "zh"];
  const selected = allowed.includes(lang) ? lang : "fr";
  state.language = selected;
  if (el.languageSelect) el.languageSelect.value = selected;
  localStorage.setItem("mycv_language", selected);
}

function hasCvContent(cvData) {
  if (!cvData) return false;
  const c = cvData.candidate || {};
  const s = cvData.sections || {};
  if (Object.values(c).some((v) => String(v || "").trim())) return true;
  return Object.values(s).some((v) => (Array.isArray(v) ? v.length > 0 : String(v || "").trim()));
}

async function translateCurrentCvToLanguage() {
  if (!state.token) return setStatus("Connecte-toi avant de traduire le CV.", true);
  if (!ensureActiveAccountForFeature()) return;
  syncFormToState();
  if (!hasCvContent(state.cvData)) return;
  try {
    setStatus("Traduction du CV en cours...");
    const data = await api("/api/cv/translate", {
      method: "POST",
      body: JSON.stringify({ cvData: state.cvData, language: state.language }),
    });
    const currentPhoto = state.cvData?.candidate?.photoDataUrl || "";
    state.cvData = data.cvData || state.cvData;
    if (!state.cvData.candidate.photoDataUrl && currentPhoto) {
      state.cvData.candidate.photoDataUrl = currentPhoto;
    }
    syncStateToForm();
    if (data.fallback) {
      setStatus(data.warning || "Traduction indisponible, contenu conserve.", true);
    } else {
      setStatus("CV traduit dans la langue selectionnee.");
    }
  } catch (error) {
    setStatus(error.message || "Echec traduction CV.", true);
  }
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
  syncTokenFromStorage();
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

async function loadAuthConfig() {
  try {
    const cfg = await api("/api/auth/config", { method: "GET", headers: {} });
    state.authConfig.allowPublicRegistration = Boolean(cfg?.allowPublicRegistration);
    state.authConfig.adminLocalOnly = Boolean(cfg?.adminLocalOnly);
  } catch {}
  applyAuthConfigUi();
}

async function logClientAction(action, meta = {}) {
  if (!state.token) return;
  try {
    await api("/api/activity/log", {
      method: "POST",
      body: JSON.stringify({ action, meta }),
    });
  } catch {}
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso || "");
  }
}

function asMetaText(meta) {
  if (!meta || typeof meta !== "object") return "";
  const pairs = Object.entries(meta)
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return pairs.join(" | ");
}

function renderAdminKpis() {
  const users = state.admin.users || [];
  const histories = state.admin.histories || [];
  const logs = state.admin.logs || [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const actions24h = logs.filter((x) => new Date(x.at).getTime() >= dayAgo);
  const fallback24h = actions24h.filter((x) => String(x?.meta?.source || "") === "fallback");
  const versions = histories.reduce((sum, h) => sum + Number(h.count || 0), 0);
  if (el.adminKpiUsers) el.adminKpiUsers.textContent = String(users.length);
  if (el.adminKpiCv) el.adminKpiCv.textContent = String(versions);
  if (el.adminKpiActions) el.adminKpiActions.textContent = String(actions24h.length);
  if (el.adminKpiFallback) el.adminKpiFallback.textContent = String(fallback24h.length);
}

function renderAdminUsers() {
  if (!el.adminUsersList) return;
  const users = state.admin.users || [];
  const histories = state.admin.histories || [];
  const countByUser = new Map(histories.map((h) => [h?.user?.id, Number(h?.count || 0)]));
  if (!users.length) {
    el.adminUsersList.innerHTML = "<p class='muted'>Aucun utilisateur.</p>";
    return;
  }
  el.adminUsersList.innerHTML = users
    .map((u) => {
      const cvCount = countByUser.get(u.id) || 0;
      return `
      <div class="admin-row">
        <strong>${u.name || "Sans nom"} - ${u.email}</strong>
        <div class="admin-meta">Role: ${u.role || "user"} | CV: ${cvCount} | Cree le: ${formatDateTime(u.createdAt)}</div>
      </div>`;
    })
    .join("");

  if (el.adminUserSelect) {
    el.adminUserSelect.innerHTML = users
      .map((u) => `<option value="${u.id}">${u.email} (${u.role || "user"})</option>`)
      .join("");
  }
}

function renderAdminActivity() {
  if (!el.adminActivityList) return;
  const logs = state.admin.logs || [];
  if (!logs.length) {
    el.adminActivityList.innerHTML = "<p class='muted'>Aucune activite.</p>";
    return;
  }
  el.adminActivityList.innerHTML = logs
    .map(
      (log) => `
      <div class="admin-row">
        <strong>${formatDateTime(log.at)} - ${log.action}</strong>
        <div class="admin-meta">${log.userEmail || "unknown"} (${log.role || "user"})</div>
        <div class="admin-meta">${asMetaText(log.meta)}</div>
      </div>`
    )
    .join("");
}

function renderAdminUserHistory(user, history) {
  if (!el.adminUserHistory) return;
  if (!history?.length) {
    el.adminUserHistory.innerHTML = "<p class='muted'>Aucune version pour cet utilisateur.</p>";
    return;
  }
  el.adminUserHistory.innerHTML = "";
  history.forEach((item) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const title = document.createElement("strong");
    title.textContent = `${item.title || "CV sans nom"} - ${formatDateTime(item.createdAt)}`;
    const meta = document.createElement("div");
    meta.className = "admin-meta";
    meta.textContent = `${user?.email || ""} | Note: ${item.note || "-"}`;
    const actions = document.createElement("div");
    actions.className = "row";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "secondary";
    viewBtn.textContent = "Voir";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Supprimer";
    viewBtn.addEventListener("click", () => {
      const html = cvToHtml(item.cvData || state.cvData, state.template);
      const win = window.open("", "_blank");
      if (!win) return setAdminStatus("Popup bloquee pour l'apercu.", true);
      win.document.write(html);
      win.document.close();
      win.focus();
    });
    delBtn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${encodeURIComponent(user.id)}/history/${encodeURIComponent(item.id)}`, {
          method: "DELETE",
          body: JSON.stringify({}),
        });
        setAdminStatus("Version supprimee.");
        await loadAdminUserHistory();
        await loadAdminDashboard();
      } catch (error) {
        setAdminStatus(error.message || "Suppression impossible.", true);
      }
    });
    actions.appendChild(viewBtn);
    actions.appendChild(delBtn);
    row.appendChild(title);
    row.appendChild(meta);
    row.appendChild(actions);
    el.adminUserHistory.appendChild(row);
  });
}

async function loadAdminUserHistory() {
  if (!isAdmin()) return;
  const userId = String(el.adminUserSelect?.value || "");
  if (!userId) return;
  try {
    const data = await api(`/api/admin/users/${encodeURIComponent(userId)}/history`, { method: "GET", headers: {} });
    renderAdminUserHistory(data.user, data.history || []);
  } catch (error) {
    setAdminStatus(error.message || "Chargement historique utilisateur impossible.", true);
  }
}

async function loadAdminActivity() {
  if (!isAdmin()) return;
  const action = String(el.adminActionFilter?.value || "").trim();
  const limit = Number(el.adminLimitFilter?.value || 200);
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  params.set("limit", String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  try {
    const data = await api(`/api/admin/activity${suffix}`, { method: "GET", headers: {} });
    state.admin.logs = Array.isArray(data.logs) ? data.logs : [];
    renderAdminActivity();
    renderAdminKpis();
  } catch (error) {
    setAdminStatus(error.message || "Chargement activite impossible.", true);
  }
}

async function createUserByAdmin() {
  if (!isAdmin()) return setAdminStatus("Acces admin requis.", true);
  try {
    const payload = {
      name: String(el.adminNewName?.value || "").trim(),
      email: String(el.adminNewEmail?.value || "").trim(),
      password: String(el.adminNewPassword?.value || ""),
      role: String(el.adminNewRole?.value || "user"),
    };
    if (!payload.email || !payload.password) return setAdminStatus("Email et mot de passe obligatoires.", true);
    await api("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
    if (el.adminNewName) el.adminNewName.value = "";
    if (el.adminNewEmail) el.adminNewEmail.value = "";
    if (el.adminNewPassword) el.adminNewPassword.value = "";
    if (el.adminNewRole) el.adminNewRole.value = "user";
    setAdminStatus("Utilisateur cree.");
    await loadAdminDashboard();
  } catch (error) {
    setAdminStatus(error.message || "Creation utilisateur impossible.", true);
  }
}

async function loadAdminDashboard() {
  setAdminVisibility();
  if (!isAdmin()) return;
  try {
    setAdminStatus("Chargement dashboard admin...");
    const usersData = await api("/api/admin/users", { method: "GET", headers: {} });
    const historiesData = await api("/api/admin/histories", { method: "GET", headers: {} });
    const activityData = await api("/api/admin/activity?limit=200", { method: "GET", headers: {} });
    state.admin.users = Array.isArray(usersData.users) ? usersData.users : [];
    state.admin.histories = Array.isArray(historiesData.histories) ? historiesData.histories : [];
    state.admin.logs = Array.isArray(activityData.logs) ? activityData.logs : [];
    renderAdminKpis();
    renderAdminUsers();
    renderAdminActivity();
    await loadAdminUserHistory();
    setAdminStatus("Dashboard admin a jour.");
  } catch (error) {
    setAdminStatus(error.message || "Impossible de charger le dashboard admin.", true);
  }
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
  if (!state.authConfig.allowPublicRegistration) {
    return setAuthStatus("Inscription publique desactivee. Demande la creation de compte a l'admin.", true);
  }
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: el.authEmail.value.trim(),
        name: el.authName.value.trim(),
        password: el.authPassword.value,
      }),
    });
    setAuthStatus(data?.message || "Inscription envoyee. Attends l'activation admin.");
    if (data?.pending) {
      state.token = "";
      state.user = null;
      localStorage.removeItem("mycv_token");
      return;
    }
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
    const msg = accountStatusMessage();
    const suffix = msg ? ` (${data.user.accountStatus})` : "";
    setAuthStatus(`Connecte: ${data.user.email}${suffix}`);
    if (msg) setStatus(msg, true);
    setAdminVisibility();
    await loadAdminDashboard();
    if (!msg) {
      await syncLocalHistoryToAccount();
      await loadHistory();
    }
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
  state.admin = { users: [], histories: [], logs: [] };
  state.cvData = empty;
  syncStateToForm();
  localStorage.removeItem("mycv_token");
  setAuthStatus("Non connecte.");
  setAdminVisibility();
  await loadHistory();
}

async function whoAmI() {
  syncTokenFromStorage();
  if (!state.token) {
    if (IS_APP_PAGE) {
      window.location.href = "/auth.html";
      return;
    }
    setAuthStatus("Non connecte. Connecte-toi pour acceder a l'application.");
    if (el.historyList) el.historyList.innerHTML = "<p class='muted'>Connecte-toi pour voir l'historique.</p>";
    setAdminVisibility();
    return;
  }
  try {
    const data = await api("/api/auth/me", { method: "GET", headers: {} });
    state.user = data.user;
    const msg = accountStatusMessage();
    const suffix = msg ? ` (${data.user.accountStatus})` : "";
    setAuthStatus(`Connecte: ${data.user.email}${suffix}`);
    if (msg) setStatus(msg, true);
    if (IS_APP_PAGE && msg) {
      window.location.href = "/pending.html";
      return;
    }
    if (IS_APP_PAGE && !msg) {
      // stay here
    }
    setAdminVisibility();
    await loadAdminDashboard();
    if (!msg) {
      await syncLocalHistoryToAccount();
      await loadHistory();
    }
  } catch {
    state.token = "";
    state.user = null;
    localStorage.removeItem("mycv_token");
    if (IS_APP_PAGE) {
      window.location.href = "/auth.html";
      return;
    }
    setAuthStatus("Session expiree. Reconnecte-toi.", true);
    if (el.historyList) el.historyList.innerHTML = "<p class='muted'>Connecte-toi pour voir l'historique.</p>";
    setAdminVisibility();
  }
}

async function analyzeFile() {
  syncTokenFromStorage();
  if (!state.token) return setStatus("Connecte-toi avant d'utiliser l'application.", true);
  if (!ensureActiveAccountForFeature()) return;
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
        language: state.language,
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
  syncTokenFromStorage();
  if (!state.token) return setStatus("Connecte-toi avant de sauvegarder une version.", true);
  if (!ensureActiveAccountForFeature()) return;
  syncFormToState();
  const note = el.saveNote.value.trim();

  try {
    setStatus("Sauvegarde en cours...");
    const data = await api("/api/cv/save", {
      method: "PUT",
      body: JSON.stringify({ cvData: state.cvData, note }),
    });
    setStatus(`Version sauvegardee (${data.version.id.slice(0, 8)}).`);
    el.saveNote.value = "";
    await loadHistory();
  } catch (error) {
    const msg = String(error.message || "Echec sauvegarde.");
    if (msg.includes("en attente de validation")) {
      setStatus("Votre compte est en attente de validation par l'administrateur.", true);
      return;
    }
    if (msg.includes("compte est bloque")) {
      setStatus("Votre compte est bloque. Contacte l'administrateur.", true);
      return;
    }
    setStatus(msg, true);
  }
}

async function loadHistory() {
  syncTokenFromStorage();
  if (!state.token) {
    el.historyList.innerHTML = "<p class='muted'>Connecte-toi pour voir l'historique.</p>";
    return;
  }
  if (!ensureActiveAccountForFeature()) {
    el.historyList.innerHTML = "<p class='muted'>Compte non actif: historique indisponible.</p>";
    return;
  }
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

function t(key) {
  const L = state.language || "fr";
  const dict = {
    profile: { fr: "Profil", en: "Profile", es: "Perfil", de: "Profil", zh: "简介" },
    education: { fr: "Formation", en: "Education", es: "Educacion", de: "Ausbildung", zh: "教育" },
    experience: { fr: "Experience", en: "Experience", es: "Experiencia", de: "Erfahrung", zh: "经验" },
    skills: { fr: "Competences", en: "Skills", es: "Habilidades", de: "Fahigkeiten", zh: "技能" },
    projects: { fr: "Projets", en: "Projects", es: "Proyectos", de: "Projekte", zh: "项目" },
    certifications: { fr: "Certifications", en: "Certifications", es: "Certificaciones", de: "Zertifikate", zh: "证书" },
    languages: { fr: "Langues", en: "Languages", es: "Idiomas", de: "Sprachen", zh: "语言" },
    interests: { fr: "Interets", en: "Interests", es: "Intereses", de: "Interessen", zh: "兴趣" },
    other: { fr: "Autre", en: "Other", es: "Otros", de: "Sonstiges", zh: "其他" },
    contact: { fr: "Contact", en: "Contact", es: "Contacto", de: "Kontakt", zh: "联系方式" },
  };
  return dict[key]?.[L] || dict[key]?.fr || key;
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
      ${contacts.length ? `<section><h3>${esc(t("contact"))}</h3><ul>${contacts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
      ${listBlock(t("skills"), cvData.sections.skills)}
      ${listBlock(t("languages"), cvData.sections.languages)}
      ${listBlock(t("certifications"), cvData.sections.certifications)}
    </aside>
    <main class="main">
      ${textBlock(t("profile"), cvData.sections.profile)}
      ${listBlock(t("education"), cvData.sections.education)}
      ${listBlock(t("experience"), cvData.sections.experience)}
      ${listBlock(t("projects"), cvData.sections.projects)}
      ${listBlock(t("interests"), cvData.sections.interests)}
      ${listBlock(t("other"), cvData.sections.other)}
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
        ${textBlock(t("profile"), cvData.sections.profile)}
        ${listBlock(t("education"), cvData.sections.education)}
        ${listBlock(t("experience"), cvData.sections.experience)}
        ${listBlock(t("projects"), cvData.sections.projects)}
      </main>
      <aside>
        ${contacts.length ? `<section><h3>${esc(t("contact"))}</h3><ul>${contacts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
        ${chips ? `<section><h3>${esc(t("skills"))}</h3><div class="chips">${chips}</div></section>` : ""}
        ${listBlock(t("languages"), cvData.sections.languages)}
        ${listBlock(t("certifications"), cvData.sections.certifications)}
        ${listBlock(t("interests"), cvData.sections.interests)}
        ${listBlock(t("other"), cvData.sections.other)}
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
    ${contacts.length ? `<section><h3>${esc(t("contact"))}</h3><p>${contacts.map((x) => esc(x)).join(" | ")}</p></section>` : ""}
    ${textBlock(t("profile"), cvData.sections.profile)}
    ${listBlock(t("education"), cvData.sections.education)}
    ${listBlock(t("experience"), cvData.sections.experience)}
    ${listBlock(t("skills"), cvData.sections.skills)}
    ${listBlock(t("projects"), cvData.sections.projects)}
    ${listBlock(t("certifications"), cvData.sections.certifications)}
    ${listBlock(t("languages"), cvData.sections.languages)}
    ${listBlock(t("interests"), cvData.sections.interests)}
    ${listBlock(t("other"), cvData.sections.other)}
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
  syncTokenFromStorage();
  if (!state.token) return setStatus("Connecte-toi avant d'exporter le CV.", true);
  if (!ensureActiveAccountForFeature()) return;
  syncFormToState();
  const html = cvToHtml(state.cvData, state.template);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(state.cvData.candidate.fullName || "cv").replace(/\s+/g, "_")}.doc`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  a.remove();
  logClientAction("cv.export.doc", { template: state.template });
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
  syncTokenFromStorage();
  if (!state.token) return setStatus("Connecte-toi avant d'exporter le CV.", true);
  if (!ensureActiveAccountForFeature()) return;
  syncFormToState();
  let exportRoot = null;
  try {
    setStatus("Preparation du PDF...");
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
    const html = cvToHtml(state.cvData, state.template);
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/i);
    exportRoot = document.createElement("div");
    exportRoot.style.position = "fixed";
    exportRoot.style.left = "0";
    exportRoot.style.top = "0";
    exportRoot.style.width = "794px";
    exportRoot.style.opacity = "0";
    exportRoot.style.pointerEvents = "none";
    exportRoot.style.zIndex = "-1";
    exportRoot.style.background = "#fff";
    const styleTag = document.createElement("style");
    styleTag.textContent = styleMatch?.[1] || "";
    exportRoot.appendChild(styleTag);
    const content = document.createElement("div");
    content.innerHTML = bodyMatch?.[1] || "";
    exportRoot.appendChild(content);
    document.body.appendChild(exportRoot);

    const fileName = `${(state.cvData.candidate.fullName || "cv").replace(/\s+/g, "_")}.pdf`;
    await window
      .html2pdf()
      .set({
        margin: 0,
        filename: fileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(exportRoot)
      .save();

    logClientAction("cv.export.pdf", { template: state.template });
    setStatus("Export PDF termine.");
  } catch (error) {
    setStatus(error.message || "Echec export PDF.", true);
  } finally {
    if (exportRoot?.parentNode) exportRoot.remove();
  }
}

function previewCv() {
  syncTokenFromStorage();
  if (!state.token) return setStatus("Connecte-toi avant de visualiser le CV.", true);
  if (!ensureActiveAccountForFeature()) return;
  syncFormToState();
  const html = cvToHtml(state.cvData, state.template);
  const win = window.open("", "_blank");
  if (!win) return setStatus("Popup bloquee: autorise les popups pour visualiser le CV.", true);
  win.document.write(html);
  win.document.close();
  win.focus();
  logClientAction("cv.preview", { template: state.template });
  setStatus("Apercu ouvert dans un nouvel onglet.");
}

function bind(node, event, handler) {
  if (node) node.addEventListener(event, handler);
}

bind(el.registerBtn, "click", register);
bind(el.loginBtn, "click", login);
bind(el.logoutBtn, "click", logout);
bind(el.analyzeBtn, "click", analyzeFile);
bind(el.photoInput, "change", handlePhotoUpload);
bind(el.previewBtn, "click", previewCv);
bind(el.saveBtn, "click", saveCv);
bind(el.refreshHistoryBtn, "click", loadHistory);
bind(el.docBtn, "click", exportDoc);
bind(el.pdfBtn, "click", exportPdf);
bind(el.adminCreateUserBtn, "click", createUserByAdmin);
bind(el.adminRefreshBtn, "click", loadAdminDashboard);
bind(el.adminLoadUserHistoryBtn, "click", loadAdminUserHistory);
bind(el.adminLoadActivityBtn, "click", loadAdminActivity);
bind(el.languageSelect, "change", async () => {
  const previous = state.language;
  applyLanguage(el.languageSelect.value);
  if (state.language !== previous) await translateCurrentCvToLanguage();
});
bind(el.templateSelect, "change", () => applyTemplate(el.templateSelect.value));
bind(el.tplProfessional, "click", () => applyTemplate("professional"));
bind(el.tplModern, "click", () => applyTemplate("modern"));
bind(el.tplMinimal, "click", () => applyTemplate("minimal"));

if (el.fullName) syncStateToForm();
if (el.languageSelect) applyLanguage(state.language);
if (el.templateSelect) applyTemplate(state.template);
setAdminVisibility();
loadAuthConfig().then(whoAmI);
