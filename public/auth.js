const state = {
  token: localStorage.getItem("mycv_token") || "",
  config: {
    allowPublicRegistration: true,
  },
  busy: false,
};

const el = {
  authEmail: document.getElementById("authEmail"),
  authName: document.getElementById("authName"),
  authPassword: document.getElementById("authPassword"),
  registerBtn: document.getElementById("registerBtn"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authStatus: document.getElementById("authStatus"),
};

function setAuthStatus(message, isError = false) {
  if (!el.authStatus) return;
  el.authStatus.textContent = message;
  el.authStatus.classList.toggle("error", Boolean(isError));
}

function setBusy(nextBusy) {
  state.busy = Boolean(nextBusy);
  if (el.registerBtn) el.registerBtn.disabled = state.busy || !state.config.allowPublicRegistration;
  if (el.loginBtn) el.loginBtn.disabled = state.busy;
  if (el.logoutBtn) el.logoutBtn.disabled = state.busy;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Erreur API.");
  return data;
}

function accountMessage(user) {
  const status = String(user?.accountStatus || "ACTIVE");
  if (status === "PENDING") return "Votre compte est en attente de validation par l'administrateur.";
  if (status === "BLOCKED") return "Votre compte est bloque. Contacte l'administrateur.";
  return "";
}

function applyConfigUi() {
  const allow = Boolean(state.config.allowPublicRegistration);
  if (el.registerBtn) {
    el.registerBtn.disabled = state.busy || !allow;
    el.registerBtn.title = allow ? "" : "Inscription desactivee.";
  }
}

async function loadConfig() {
  try {
    const cfg = await api("/api/auth/config", { method: "GET", headers: {} });
    state.config.allowPublicRegistration = Boolean(cfg?.allowPublicRegistration);
  } catch {}
  applyConfigUi();
}

async function whoAmI() {
  if (!state.token) return;
  try {
    const data = await api("/api/auth/me", { method: "GET", headers: {} });
    const msg = accountMessage(data.user);
    if (!msg) {
      window.location.href = "/app.html";
      return;
    }
    window.location.href = "/pending.html";
  } catch {
    state.token = "";
    localStorage.removeItem("mycv_token");
  }
}

async function register() {
  if (state.busy) return;
  if (!state.config.allowPublicRegistration) {
    return setAuthStatus("Inscription desactivee. Contacte l'administrateur.", true);
  }
  const email = String(el.authEmail?.value || "").trim();
  const name = String(el.authName?.value || "").trim();
  const password = String(el.authPassword?.value || "");
  if (!isValidEmail(email)) return setAuthStatus("Entre un email valide.", true);
  if (!name) return setAuthStatus("Entre ton nom pour l'inscription.", true);
  if (password.length < 6) return setAuthStatus("Mot de passe trop court (minimum 6 caracteres).", true);
  try {
    setBusy(true);
    const body = {
      email,
      name,
      password,
    };
    const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
    setAuthStatus(data?.message || "Inscription enregistree.");
  } catch (error) {
    setAuthStatus(error.message || "Inscription impossible.", true);
  } finally {
    setBusy(false);
  }
}

async function login() {
  if (state.busy) return;
  const email = String(el.authEmail?.value || "").trim();
  const password = String(el.authPassword?.value || "");
  if (!isValidEmail(email)) return setAuthStatus("Entre un email valide.", true);
  if (!password) return setAuthStatus("Entre ton mot de passe.", true);
  try {
    setBusy(true);
    const body = {
      email,
      password,
    };
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
    state.token = data.token;
    localStorage.setItem("mycv_token", state.token);
    const msg = accountMessage(data.user);
    if (msg) {
      window.location.href = "/pending.html";
      return;
    }
    window.location.href = "/app.html";
  } catch (error) {
    setAuthStatus(error.message || "Connexion impossible.", true);
  } finally {
    setBusy(false);
  }
}

async function logout() {
  try {
    if (state.token) await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  state.token = "";
  localStorage.removeItem("mycv_token");
  setAuthStatus("Non connecte.");
}

if (el.registerBtn) el.registerBtn.addEventListener("click", register);
if (el.loginBtn) el.loginBtn.addEventListener("click", login);
if (el.logoutBtn) el.logoutBtn.addEventListener("click", logout);
if (el.authPassword) {
  el.authPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
}
if (el.authEmail) {
  el.authEmail.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
}

loadConfig().then(whoAmI);
