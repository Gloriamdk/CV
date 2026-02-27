
      const state = {
        source: "text",
        language: "fr",
        raw_text: "",
        debug_raw_text: "",
        debug_sections: {},
        preview_template: "classic",
        profile_photo_data_url: "",
        cv: emptyCv(),
      };

      function emptyCv() {
        return {
          personal: {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            city: "",
            linkedin: "",
          },
          summary: "",
          skills: [],
          experience: [],
          education: [],
        };
      }

      function showStatus(message, isError = false) {
        const status = document.getElementById("status");
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? "#b10020" : "#124";
      }

      function asString(value) {
        return typeof value === "string" ? value : "";
      }

      function asStringArray(value) {
        if (Array.isArray(value)) {
          return value.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
        }
        if (typeof value === "string") {
          return value
            .split(/[\n,;|]/g)
            .map((x) => x.trim())
            .filter(Boolean);
        }
        return [];
      }

      function esc(value) {
        return asString(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function normalizeCv(input) {
        const cv = input && typeof input === "object" ? input : {};
        const personal = cv.personal || cv.personal_info || {};
        const educationRaw = Array.isArray(cv.education) ? cv.education : [];
        const experienceRaw = Array.isArray(cv.experience) ? cv.experience : [];

        return {
          personal: {
            firstName: asString(personal.firstName || personal.first_name),
            lastName: asString(personal.lastName || personal.last_name),
            email: asString(personal.email),
            phone: asString(personal.phone),
            city: asString(personal.city || personal.location),
            linkedin: asString(personal.linkedin),
          },
          summary: asString(cv.summary),
          skills: asStringArray(cv.skills),
          experience: experienceRaw.map((exp) => ({
            title: asString(exp && (exp.title || exp.poste)),
            company: asString(exp && (exp.company || exp.entreprise)),
            location: asString(exp && (exp.location || exp.lieu)),
            startDate: asString(exp && (exp.startDate || exp.start_date)),
            endDate: asString(exp && (exp.endDate || exp.end_date)),
            bullets: asStringArray(exp && (exp.bullets || exp.highlights)),
          })),
          education: educationRaw.map((edu) => ({
            degree: asString(edu && (edu.degree || edu.diplome)),
            school: asString(edu && (edu.school || edu.ecole || edu.universite)),
            location: asString(edu && (edu.location || edu.ville)),
            startDate: asString(edu && (edu.startDate || edu.start_date)),
            endDate: asString(edu && (edu.endDate || edu.end_date)),
            details: asString(edu && (edu.details || edu.description)),
          })),
        };
      }

      function bindPersonalInfo() {
        const map = [
          ["firstName", "pi_first_name"],
          ["lastName", "pi_last_name"],
          ["email", "pi_email"],
          ["phone", "pi_phone"],
          ["city", "pi_location"],
          ["linkedin", "pi_linkedin"],
        ];
        map.forEach(([key, elementId]) => {
          const el = document.getElementById(elementId);
          if (!el) return;
          el.value = state.cv.personal[key] || "";
          el.oninput = () => {
            state.cv.personal[key] = el.value;
            refreshPreview();
          };
        });
      }

      function renderExperience() {
        const container = document.getElementById("experienceList");
        container.innerHTML = "";

        state.cv.experience.forEach((exp, index) => {
          const item = document.createElement("div");
          item.className = "card-item";
          item.innerHTML = `
            <div class="grid grid2">
              <input placeholder="Poste" value="${esc(exp.title)}" data-k="title" />
              <input placeholder="Entreprise" value="${esc(exp.company)}" data-k="company" />
              <input placeholder="Debut" value="${esc(exp.startDate)}" data-k="startDate" />
              <input placeholder="Fin" value="${esc(exp.endDate)}" data-k="endDate" />
              <input placeholder="Lieu" value="${esc(exp.location)}" data-k="location" />
            </div>
            <textarea rows="3" data-k="bullets" placeholder="Une ligne par realisation">${esc(
              asStringArray(exp.bullets).join("\n")
            )}</textarea>
            <button type="button" data-remove="1">Supprimer</button>
          `;

          item.querySelectorAll("input, textarea").forEach((field) => {
            field.addEventListener("input", () => {
              const key = field.dataset.k;
              if (key === "bullets") {
                state.cv.experience[index].bullets = field.value
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean);
              } else {
                state.cv.experience[index][key] = field.value;
              }
              refreshPreview();
            });
          });

          item.querySelector("[data-remove='1']").onclick = () => {
            state.cv.experience.splice(index, 1);
            renderExperience();
            refreshPreview();
          };

          container.appendChild(item);
        });
      }

      function renderEducation() {
        const container = document.getElementById("educationList");
        container.innerHTML = "";

        state.cv.education.forEach((edu, index) => {
          const item = document.createElement("div");
          item.className = "card-item";
          item.innerHTML = `
            <div class="grid grid2">
              <input placeholder="Ecole" value="${esc(edu.school)}" data-k="school" />
              <input placeholder="Diplome" value="${esc(edu.degree)}" data-k="degree" />
              <input placeholder="Lieu" value="${esc(edu.location)}" data-k="location" />
              <input placeholder="Debut" value="${esc(edu.startDate)}" data-k="startDate" />
              <input placeholder="Fin" value="${esc(edu.endDate)}" data-k="endDate" />
            </div>
            <textarea rows="3" data-k="details" placeholder="Details">${esc(edu.details)}</textarea>
            <button type="button" data-remove="1">Supprimer</button>
          `;

          item.querySelectorAll("input, textarea").forEach((field) => {
            field.addEventListener("input", () => {
              const key = field.dataset.k;
              state.cv.education[index][key] = field.value;
              refreshPreview();
            });
          });

          item.querySelector("[data-remove='1']").onclick = () => {
            state.cv.education.splice(index, 1);
            renderEducation();
            refreshPreview();
          };

          container.appendChild(item);
        });
      }

      function bindSummaryAndSkills() {
        const summary = document.getElementById("summary");
        const skills = document.getElementById("skills");

        summary.value = state.cv.summary || "";
        skills.value = asStringArray(state.cv.skills).join(", ");

        summary.oninput = () => {
          state.cv.summary = summary.value;
          refreshPreview();
        };

        skills.oninput = () => {
          state.cv.skills = skills.value
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          refreshPreview();
        };
      }

      function refreshPreview() {
        // JSON preview removed from UI; keep function for state update hooks.
        return;
      }

      function renderDebug() {
        const raw = document.getElementById("debugRawText");
        const sections = document.getElementById("debugSections");
        raw.value = state.debug_raw_text || state.raw_text || "";
        sections.value = JSON.stringify(state.debug_sections || {}, null, 2);
      }

      function renderCvPreview() {
        const el = document.getElementById("cvPreview");
        if (!el) return;
        const p = state.cv.personal || {};
        const skills = asStringArray(state.cv.skills);
        const exp = Array.isArray(state.cv.experience) ? state.cv.experience : [];
        const edu = Array.isArray(state.cv.education) ? state.cv.education : [];
        const photoHtml = state.profile_photo_data_url
          ? `<img class="profile-photo" src="${state.profile_photo_data_url}" alt="Photo profil" />`
          : `<div class="profile-photo profile-photo-placeholder">Photo</div>`;

        const contactParts = [p.city, p.phone, p.email, p.linkedin].filter(Boolean).map(esc);
        const skillsHtml = skills.length ? skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("") : "<em>Non renseigne</em>";

        const expHtml = exp.length
          ? exp
              .map(
                (e) => `
                  <div class="preview-item">
                    <strong>${esc(e.title || "")}</strong> - ${esc(e.company || "")}
                    <div>${esc(e.location || "")} ${esc(e.startDate || "")} ${esc(e.endDate ? "-> " + e.endDate : "")}</div>
                    <ul>${asStringArray(e.bullets).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
                  </div>
                `
              )
              .join("")
          : "<em>Aucune experience detectee</em>";

        const eduHtml = edu.length
          ? edu
              .map(
                (e) => `
                  <div class="preview-item">
                    <strong>${esc(e.degree || "")}</strong> - ${esc(e.school || "")}
                    <div>${esc(e.location || "")} ${esc(e.startDate || "")} ${esc(e.endDate ? "-> " + e.endDate : "")}</div>
                    <div>${esc(e.details || "")}</div>
                  </div>
                `
              )
              .join("")
          : "<em>Aucune formation detectee</em>";

        const fullName = esc(`${p.firstName || ""} ${p.lastName || ""}`.trim() || "Nom du candidat");
        const contactLine = contactParts.join(" | ") || "Contact non renseigne";
        const template = state.preview_template || "classic";
        el.className = `cv-preview cv-template-${template}`;

        if (template === "sidebar") {
          el.innerHTML = `
            <div class="preview-sidebar">${photoHtml}<h4>${fullName}</h4><div>${contactLine}</div></div>
            <div class="preview-main">
              <div class="preview-section"><h5>Profil</h5><p>${esc(state.cv.summary || "Non renseigne")}</p></div>
              <div class="preview-section"><h5>Experiences</h5>${expHtml}</div>
              <div class="preview-section"><h5>Formations</h5>${eduHtml}</div>
              <div class="preview-section"><h5>Competences</h5><div class="chips">${skillsHtml}</div></div>
            </div>
          `;
          return;
        }

        if (template === "minimal") {
          el.innerHTML = `
            <div class="preview-head">${photoHtml}<div><h4>${fullName}</h4><div>${contactLine}</div></div></div>
            <div class="preview-section"><h5>Profil</h5><p>${esc(state.cv.summary || "Non renseigne")}</p></div>
            <div class="preview-section"><h5>Competences</h5><div class="chips">${skillsHtml}</div></div>
            <div class="preview-section"><h5>Experiences</h5>${expHtml}</div>
            <div class="preview-section"><h5>Formations</h5>${eduHtml}</div>
          `;
          return;
        }

        el.innerHTML = `
          <div class="preview-head">${photoHtml}<div><h4>${fullName}</h4><div>${contactLine}</div></div></div>
          <div class="preview-section"><h5>Profil</h5><p>${esc(state.cv.summary || "Non renseigne")}</p></div>
          <div class="preview-section"><h5>Experiences</h5>${expHtml}</div>
          <div class="preview-section"><h5>Competences</h5><div class="chips">${skillsHtml}</div></div>
          <div class="preview-section"><h5>Formations</h5>${eduHtml}</div>
        `;
      }

      function renderAll() {
        bindPersonalInfo();
        bindSummaryAndSkills();
        renderExperience();
        renderEducation();
        renderDebug();
        renderCvPreview();
        refreshPreview();
      }

      async function refreshList() {
        const list = document.getElementById("savedList");
        list.innerHTML = "";

        try {
          const response = await fetch("/api/cv-list");
          const items = await response.json();

          items.forEach((item) => {
            const li = document.createElement("li");
            li.innerHTML = `<strong>${esc(item.title)}</strong> <button type="button">Charger</button>`;
            li.querySelector("button").onclick = async () => {
              const detail = await fetch(`/api/cv/${item.id}`).then((r) => r.json());
              state.source = detail.source || "text";
              state.language = detail.language || "fr";
              state.raw_text = detail.raw_text || "";
              state.debug_raw_text = detail.raw_text || "";
              state.debug_sections = {};
              state.cv = normalizeCv(detail.cv || {});
              document.getElementById("cvTitle").value = detail.title || "Mon CV IA";
              renderAll();
              showStatus("CV charge");
            };
            list.appendChild(li);
          });
        } catch (err) {
          showStatus(`Erreur chargement liste: ${err.message || err}`, true);
        }
      }

      document.getElementById("uploadForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById("cvFile");
        const languageHint = document.getElementById("languageHint").value;
        const file = fileInput.files && fileInput.files[0];

        if (!file) {
          showStatus("Selectionnez un fichier.", true);
          return;
        }

        const form = new FormData();
        form.append("file", file);
        form.append("language_hint", languageHint);

        showStatus("Extraction en cours...");

        try {
          const response = await fetch("/api/parse-cv", { method: "POST", body: form });
          const text = await response.text();
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            throw new Error(`Reponse serveur invalide: ${text.slice(0, 180)}`);
          }

          if (!response.ok) {
            state.debug_raw_text = data.debug_raw_text || "";
            state.debug_sections = data.debug_sections || {};
            renderDebug();
            throw new Error(data.detail || "Impossible de parser ce fichier.");
          }

          state.source = data.source || "text";
          state.language = data.language || languageHint;
          state.raw_text = data.raw_text || "";
          state.debug_raw_text = data.debug_raw_text || data.raw_text || "";
          state.debug_sections = data.debug_sections || {};
          state.cv = normalizeCv(data.cv || {});
          renderAll();
          showStatus("CV importe et prerempli.");
        } catch (err) {
          showStatus(`Echec import: ${err.message || "Erreur inconnue"}`, true);
        }
      });

      document.getElementById("saveForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("cvTitle").value || "Mon CV IA";

        try {
          const response = await fetch("/api/save-cv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              source: state.source,
              language: state.language,
              raw_text: state.raw_text,
              cv: state.cv,
            }),
          });

          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.detail || "Erreur sauvegarde");
          showStatus("CV sauvegarde. Apercu mis a jour.");
          renderCvPreview();
          refreshList();
        } catch (err) {
          showStatus("Echec sauvegarde. Reessayez.", true);
        }
      });

      document.getElementById("addExperience").onclick = () => {
        state.cv.experience.push({
          title: "",
          company: "",
          location: "",
          startDate: "",
          endDate: "",
          bullets: [],
        });
        renderExperience();
        refreshPreview();
      };

      document.getElementById("addEducation").onclick = () => {
        state.cv.education.push({
          degree: "",
          school: "",
          location: "",
          startDate: "",
          endDate: "",
          details: "",
        });
        renderEducation();
        refreshPreview();
      };

      document.getElementById("reloadList").onclick = refreshList;
      document.getElementById("saveEditorBtn").onclick = () => {
        const form = document.getElementById("saveForm");
        if (form && typeof form.requestSubmit === "function") {
          form.requestSubmit();
        }
      };
      document.getElementById("previewTemplate").onchange = (e) => {
        state.preview_template = e.target.value || "classic";
        renderCvPreview();
      };
      document.getElementById("profilePhotoInput").onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          state.profile_photo_data_url = String(reader.result || "");
          renderCvPreview();
        };
        reader.readAsDataURL(file);
      };

      window.addEventListener("error", (event) => {
        showStatus("Erreur interface. Rechargez la page.", true);
      });

      window.addEventListener("unhandledrejection", (event) => {
        showStatus("Erreur traitement. Reessayez l'operation.", true);
      });

      renderAll();
      refreshList();
    
