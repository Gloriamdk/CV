
      const state = {
        template: "simple",
        profile_photo_data_url: "",
        cv: {},
      };

      function showStatus(message, isError = false) {
        const el = document.getElementById("status");
        el.textContent = message;
        el.style.color = isError ? "#b10020" : "#124";
      }

      function asString(value) {
        return typeof value === "string" ? value : "";
      }

      function asStringArray(value) {
        if (!Array.isArray(value)) return [];
        return value.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
      }

      function esc(value) {
        return asString(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }

      function defaultCv() {
        return {
          personal: { firstName: "", lastName: "", email: "", phone: "", city: "", linkedin: "" },
          summary: "",
          skills: [],
          experience: [],
          education: [],
        };
      }

      function loadCv() {
        try {
          const raw = localStorage.getItem("cv_preview_data");
          const title = localStorage.getItem("cv_preview_title");
          state.cv = raw ? JSON.parse(raw) : defaultCv();
          if (title) document.getElementById("cvTitle").value = title;
        } catch (_) {
          state.cv = defaultCv();
        }
      }

      function renderPreview() {
        const el = document.getElementById("cvPreview");
        const p = state.cv.personal || {};
        const skills = asStringArray(state.cv.skills);
        const exp = Array.isArray(state.cv.experience) ? state.cv.experience : [];
        const edu = Array.isArray(state.cv.education) ? state.cv.education : [];
        const photoHtml = state.profile_photo_data_url
          ? `<img class="profile-photo" src="${state.profile_photo_data_url}" alt="Photo profil" />`
          : `<div class="profile-photo profile-photo-placeholder">Photo</div>`;
        const fullName = esc(`${p.firstName || ""} ${p.lastName || ""}`.trim() || "Nom du candidat");
        const contactLine = [p.city, p.phone, p.email, p.linkedin].filter(Boolean).map(esc).join(" | ") || "Contact non renseigne";
        const skillsHtml = skills.length ? skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("") : "<em>Non renseigne</em>";
        const expHtml = exp.length
          ? exp
              .map(
                (e) => `<div class="preview-item"><strong>${esc(e.title || "")}</strong> - ${esc(e.company || "")}<div>${esc(e.location || "")} ${esc(e.startDate || "")} ${esc(e.endDate || "")}</div></div>`
              )
              .join("")
          : "<em>Aucune experience detectee</em>";
        const eduHtml = edu.length
          ? edu
              .map(
                (e) => `<div class="preview-item"><strong>${esc(e.degree || "")}</strong> - ${esc(e.school || "")}<div>${esc(e.location || "")} ${esc(e.startDate || "")} ${esc(e.endDate || "")}</div></div>`
              )
              .join("")
          : "<em>Aucune formation detectee</em>";

        el.className = `cv-preview cv-template-${state.template === "simple" ? "classic" : state.template}`;
        el.innerHTML = `
          <div class="preview-head">${photoHtml}<div><h4>${fullName}</h4><div>${contactLine}</div></div></div>
          <div class="preview-section"><h5>Profil</h5><p>${esc(state.cv.summary || "Non renseigne")}</p></div>
          <div class="preview-section"><h5>Experiences</h5>${expHtml}</div>
          <div class="preview-section"><h5>Competences</h5><div class="chips">${skillsHtml}</div></div>
          <div class="preview-section"><h5>Formations</h5>${eduHtml}</div>
        `;
      }

      async function exportPdf() {
        const title = document.getElementById("cvTitle").value || "Mon CV";
        showStatus("Generation PDF en cours...");
        try {
          const response = await fetch("/api/export-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cv: state.cv, template: state.template, title }),
          });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || `Export failed (${response.status})`);
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${title.replace(/\s+/g, "_")}_${state.template}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showStatus("PDF exporte.");
        } catch (err) {
          showStatus(`Erreur export: ${err.message || err}`, true);
        }
      }

      document.querySelectorAll(".template-card").forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll(".template-card").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          state.template = btn.dataset.template || "simple";
          renderPreview();
        };
      });

      document.getElementById("profilePhotoInput").onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          state.profile_photo_data_url = String(reader.result || "");
          renderPreview();
        };
        reader.readAsDataURL(file);
      };

      document.getElementById("exportPdfBtn").onclick = exportPdf;
      document.getElementById("backBtn").onclick = () => (window.location.href = "/");

      loadCv();
      renderPreview();
    
