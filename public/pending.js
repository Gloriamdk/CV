let token = localStorage.getItem("mycv_token") || "";

const el = {
  pendingMessage: document.getElementById("pendingMessage"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Erreur API.");
  return data;
}

function setMessage(msg, isError = true) {
  el.pendingMessage.textContent = msg;
  el.pendingMessage.classList.toggle("error", Boolean(isError));
}

function accountMessage(user) {
  const status = String(user?.accountStatus || "ACTIVE");
  if (status === "PENDING") return "Votre compte est en attente de validation par l'administrateur.";
  if (status === "BLOCKED") return "Votre compte est bloque. Contacte l'administrateur.";
  return "";
}

async function checkStatus() {
  if (!token) {
    window.location.href = "/auth.html";
    return;
  }
  try {
    const me = await api("/api/auth/me", { method: "GET", headers: {} });
    const msg = accountMessage(me.user);
    if (!msg) {
      window.location.href = "/app.html";
      return;
    }
    setMessage(msg, true);
  } catch (error) {
    setMessage(error.message || "Session invalide.", true);
  }
}

async function logout() {
  try {
    if (token) await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  token = "";
  localStorage.removeItem("mycv_token");
  window.location.href = "/auth.html";
}

el.refreshBtn.addEventListener("click", checkStatus);
el.logoutBtn.addEventListener("click", logout);

checkStatus();
