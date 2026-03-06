let token = localStorage.getItem("mycv_token") || "";

const el = {
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authStatus: document.getElementById("authStatus"),
  adminStatus: document.getElementById("adminStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  kpiUsers: document.getElementById("kpiUsers"),
  kpiCv: document.getElementById("kpiCv"),
  kpiPending: document.getElementById("kpiPending"),
  kpiBlocked: document.getElementById("kpiBlocked"),
  importsList: document.getElementById("importsList"),
  exportsList: document.getElementById("exportsList"),
  usersTableBody: document.getElementById("usersTableBody"),
  actionsList: document.getElementById("actionsList"),
};

function setStatus(message, isError = false) {
  el.adminStatus.textContent = message;
  el.adminStatus.classList.toggle("error", Boolean(isError));
}

function setAuthStatus(message, isError = false) {
  el.authStatus.textContent = message;
  el.authStatus.classList.toggle("error", Boolean(isError));
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso || "");
  }
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erreur API");
  return data;
}

function renderOverview(data) {
  const k = data?.kpis || {};
  el.kpiUsers.textContent = String(k.totalUsers || 0);
  el.kpiCv.textContent = String(k.totalCv || 0);
  el.kpiPending.textContent = String(k.pendingUsers || 0);
  el.kpiBlocked.textContent = String(k.blockedUsers || 0);

  const imports = Array.isArray(data?.recentImports) ? data.recentImports : [];
  el.importsList.innerHTML = imports.length
    ? imports
        .map(
          (x) =>
            `<div class="admin-row"><strong>${fmt(x.at)} - ${x.userEmail || ""}</strong><div class="admin-meta">${x.meta?.fileName || ""}</div></div>`
        )
        .join("")
    : "<p class='muted'>Aucun import recent.</p>";

  const exportsPdf = Array.isArray(data?.recentExportsPdf) ? data.recentExportsPdf : [];
  el.exportsList.innerHTML = exportsPdf.length
    ? exportsPdf
        .map(
          (x) =>
            `<div class="admin-row"><strong>${fmt(x.at)} - ${x.userEmail || ""}</strong><div class="admin-meta">${x.meta?.template || ""}</div></div>`
        )
        .join("")
    : "<p class='muted'>Aucun export PDF recent.</p>";

  const users = Array.isArray(data?.users) ? data.users : [];
  el.usersTableBody.innerHTML = users
    .map(
      (u) => `
      <tr>
        <td>${u.email}</td>
        <td>${fmt(u.createdAt)}</td>
        <td>${u.role}</td>
        <td><span class="pill ${u.accountStatus}">${u.accountStatus}</span></td>
        <td>${u.cvCount || 0}</td>
        <td>${u.lastImportAt ? fmt(u.lastImportAt) : "-"}</td>
        <td>${u.lastPdfExportAt ? fmt(u.lastPdfExportAt) : "-"}</td>
        <td>
          ${u.accountStatus === "PENDING" ? `<button type="button" class="activate-btn" data-user-id="${u.id}">ACTIVER</button>` : ""}
          ${u.accountStatus === "ACTIVE" ? `<button type="button" class="block-btn secondary" data-user-id="${u.id}">BLOQUER</button>` : ""}
          ${u.accountStatus === "BLOCKED" ? `<button type="button" class="unblock-btn" data-user-id="${u.id}">DEBLOQUER</button>` : ""}
        </td>
      </tr>`
    )
    .join("");

  const actions = Array.isArray(data?.recentActions) ? data.recentActions : [];
  el.actionsList.innerHTML = actions.length
    ? actions
        .map(
          (x) =>
            `<div class="admin-row"><strong>${fmt(x.at)} - ${x.action}</strong><div class="admin-meta">${x.userEmail || ""}</div><div class="admin-meta">${Object.entries(x.meta || {})
              .slice(0, 6)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" | ")}</div></div>`
        )
        .join("")
    : "<p class='muted'>Aucune action.</p>";
}

async function loadOverview() {
  try {
    setStatus("Chargement du dashboard admin...");
    const me = await api("/api/auth/me", { method: "GET", headers: {} });
    if (String(me?.user?.role || "") !== "admin") {
      setStatus("Acces refuse: compte admin requis.", true);
      setAuthStatus("Connecte, mais pas admin.", true);
      return;
    }
    setAuthStatus(`Connecte: ${me.user.email}`);
    const overview = await api("/api/admin/overview", { method: "GET", headers: {} });
    renderOverview(overview);
    setStatus("Dashboard admin a jour.");
  } catch (error) {
    setStatus(error.message || "Impossible de charger le dashboard.", true);
    setAuthStatus("Non connecte.", true);
  }
}

async function login() {
  try {
    const body = JSON.stringify({
      email: String(el.authEmail.value || "").trim(),
      password: String(el.authPassword.value || ""),
    });
    const data = await api("/api/auth/login", { method: "POST", body });
    token = data.token || "";
    localStorage.setItem("mycv_token", token);
    setAuthStatus(`Connecte: ${data?.user?.email || ""}`);
    await loadOverview();
  } catch (error) {
    setAuthStatus(error.message || "Connexion impossible.", true);
  }
}

async function logout() {
  try {
    if (token) await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  token = "";
  localStorage.removeItem("mycv_token");
  setAuthStatus("Non connecte.");
  setStatus("Connecte-toi pour charger le dashboard admin.", true);
}

async function updateUserStatus(userId, accountStatus) {
  try {
    await api(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ accountStatus }),
    });
    setStatus("Statut utilisateur mis a jour.");
    await loadOverview();
  } catch (error) {
    setStatus(error.message || "Mise a jour statut impossible.", true);
  }
}

async function handleUserAction(event) {
  const target = event.target;
  if (!target) return;
  const userId = target.getAttribute("data-user-id");
  if (!userId) return;
  if (target.classList.contains("activate-btn")) return updateUserStatus(userId, "ACTIVE");
  if (target.classList.contains("block-btn")) return updateUserStatus(userId, "BLOCKED");
  if (target.classList.contains("unblock-btn")) return updateUserStatus(userId, "ACTIVE");
}

el.refreshBtn.addEventListener("click", loadOverview);
el.usersTableBody.addEventListener("click", handleUserAction);
el.loginBtn.addEventListener("click", login);
el.logoutBtn.addEventListener("click", logout);

loadOverview();
setInterval(loadOverview, 15000);
