const state = {
  token: localStorage.getItem("mycv_token") || "",
  config: {
    allowPublicRegistration: true,
  },
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
  el.authStatus.textContent = message;
  el.authStatus.classList.toggle("error", Boolean(isError));
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
  el.registerBtn.disabled = !allow;
  el.registerBtn.title = allow ? "" : "Inscription desactivee.";
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
  if (!state.config.allowPublicRegistration) {
    return setAuthStatus("Inscription desactivee. Contacte l'administrateur.", true);
  }
  try {
    const body = {
      email: el.authEmail.value.trim(),
      name: el.authName.value.trim(),
      password: el.authPassword.value,
    };
    const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
    setAuthStatus(data?.message || "Inscription enregistree.");
  } catch (error) {
    setAuthStatus(error.message || "Inscription impossible.", true);
  }
}

async function login() {
  try {
    const body = {
      email: el.authEmail.value.trim(),
      password: el.authPassword.value,
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

el.registerBtn.addEventListener("click", register);
el.loginBtn.addEventListener("click", login);
el.logoutBtn.addEventListener("click", logout);

loadConfig().then(whoAmI);
