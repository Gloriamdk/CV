import base64
import json
import os
import re
import unicodedata
import zipfile
from io import BytesIO
from xml.etree import ElementTree

SECTION_HEADERS = {
    "summary": [
        "profil",
        "profil professionnel",
        "resume",
        "summary",
        "about",
        "a propos",
        "objectif",
    ],
    "experience": [
        "experience",
        "experiences",
        "experience professionnelle",
        "experiences professionnelles",
        "professional experience",
        "work experience",
        "parcours professionnel",
    ],
    "education": [
        "formation",
        "formations",
        "education",
        "etudes",
        "academic background",
        "education and training",
    ],
    "skills": [
        "competences",
        "competence",
        "skills",
        "technical skills",
        "outils",
        "technologies",
    ],
}

TECHNICAL_NOISE_TERMS = {
    "x11",
    "skia",
    "font",
    "glyph",
    "truetype",
    "obj",
    "endobj",
    "stream",
    "endstream",
    "xref",
    "trailer",
    "mediabox",
    "cropbox",
    "resources",
    "metadata",
    "producer",
    "creator",
    "adobe",
    "pdf",
    "khtml",
    "linux",
    "x86_64",
    "gecko",
    "mozilla",
    "webkit",
    "chrome",
}

MONTH_TOKENS = (
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
    "janv",
    "fev",
    "mars",
    "avr",
    "mai",
    "juin",
    "juil",
    "aout",
    "sept",
    "oct",
    "nov",
    "dec",
)

TITLE_HINTS = (
    "developpeur",
    "developer",
    "engineer",
    "ingenieur",
    "manager",
    "consultant",
    "analyste",
    "chef",
    "responsable",
    "intern",
    "stagiaire",
)

DEGREE_HINTS = (
    "master",
    "mba",
    "licence",
    "bachelor",
    "doctorat",
    "phd",
    "diplome",
    "certificat",
    "bts",
    "dut",
    "ingenieur",
)

CITY_HINT_WORDS = (
    "paris",
    "lyon",
    "marseille",
    "lille",
    "toulouse",
    "bordeaux",
    "lome",
    "abidjan",
    "dakar",
    "london",
    "new york",
    "montreal",
    "bruxelles",
)

SKILL_HINT_TOKENS = {
    "python",
    "django",
    "fastapi",
    "flask",
    "java",
    "javascript",
    "typescript",
    "react",
    "node",
    "sql",
    "mysql",
    "postgresql",
    "mongodb",
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "gcp",
    "linux",
    "git",
    "html",
    "css",
    "php",
    "c",
    "c++",
    "c#",
    "go",
    "rust",
}


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _match_text(text: str) -> str:
    return _normalize_text(text).lower().strip()


def _is_noise_line(line: str) -> bool:
    raw = line.strip()
    if not raw:
        return True

    norm = _match_text(raw)

    if re.fullmatch(r"[A-Fa-f0-9]{10,}", raw):
        return True

    technical_hits = sum(1 for token in TECHNICAL_NOISE_TERMS if token in norm)
    if technical_hits >= 2 and not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", raw):
        return True

    if re.search(r"\b(?:x11|skia|khtml|gecko|x86_64)\b", norm):
        return True

    if len(raw) > 5:
        alpha_num = sum(ch.isalnum() for ch in raw)
        ratio = alpha_num / len(raw)
        if ratio < 0.45:
            return True

    if len(raw) > 140 and not re.search(r"\b(19|20)\d{2}\b", raw):
        return True

    # Heuristic: mostly non-readable symbols/gibberish.
    readable_chars = sum(ch.isalnum() or ch in " .,@:+-_/|()'" for ch in raw)
    if len(raw) >= 20 and (readable_chars / len(raw)) < 0.55:
        return True

    return False


def _is_good_summary_line(line: str) -> bool:
    if _is_noise_line(line):
        return False
    low = _match_text(line)
    if any(t in low for t in ("x11", "skia", "khtml", "pdf", "gecko", "x86_64")):
        return False
    if "@" in line:
        return False
    if len(line.split()) < 4:
        return False
    return True


def _looks_like_name_line(line: str) -> bool:
    s = line.strip()
    if len(s) > 60 or "@" in s or any(ch.isdigit() for ch in s):
        return False
    parts = [p for p in re.split(r"[^A-Za-zÀ-ÿ]+", s) if p]
    if len(parts) < 2 or len(parts) > 4:
        return False
    return all(len(p) >= 2 for p in parts)


def _extract_city_from_lines(lines: list[str]) -> str:
    for line in lines[:15]:
        raw = line.strip()
        low = _match_text(raw)
        # Location markers often used in CV headers.
        if any(icon in raw for icon in ("📍", "🏠", "⌂", "📌", "🗺")):
            cleaned = re.sub(r"[📍🏠⌂📌🗺]", " ", raw).strip(" :-|")
            cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
            if cleaned:
                return cleaned
        if any(w in low for w in CITY_HINT_WORDS):
            return raw
        if re.search(r"\b(?:ville|city|adresse|location)\b", low):
            cleaned = re.sub(r"(?i)^(ville|city|adresse|location)\s*[:\-]\s*", "", raw).strip()
            if cleaned:
                return cleaned
        if "," in raw and len(raw.split()) <= 8 and not any(ch.isdigit() for ch in raw):
            return raw
        # Handle "Lome - Togo" or "Paris | France"
        if (" - " in raw or " | " in raw) and len(raw.split()) <= 8 and not any(ch.isdigit() for ch in raw):
            return raw
    return ""


def _extract_linkedin_fallback(text: str) -> str:
    match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s]+", text, flags=re.IGNORECASE)
    if match:
        return match.group(0)
    label = re.search(r"(?i)linkedin\s*[:\-]\s*([^\n]+)", text)
    if label:
        value = label.group(1).strip()
        if value:
            return value
    return ""


def clean_extracted_text(text: str) -> str:
    text = (text or "").replace("\r", "")
    out: list[str] = []
    last = ""

    for line in text.split("\n"):
        compact = re.sub(r"\s+", " ", line).strip()
        if not compact:
            if out and out[-1] != "":
                out.append("")
            continue

        if _is_noise_line(compact):
            continue

        if compact == last:
            continue

        out.append(compact)
        last = compact

    while out and out[-1] == "":
        out.pop()

    return "\n".join(out)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return _extract_text_from_pdf_fallback(file_bytes)

    reader = PdfReader(BytesIO(file_bytes))
    raw = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    return clean_extracted_text(raw)


def _extract_text_from_pdf_fallback(file_bytes: bytes) -> str:
    decoded = file_bytes.decode("latin-1", errors="ignore")
    chunks = re.findall(r"\(([^()]*)\)", decoded)
    cleaned: list[str] = []

    for chunk in chunks:
        line = re.sub(r"\\[nrt]", " ", chunk)
        line = re.sub(r"\\\d{3}", "", line)
        line = re.sub(r"\s{2,}", " ", line).strip()
        if line and not _is_noise_line(line):
            cleaned.append(line)

    return clean_extracted_text("\n".join(cleaned))


def extract_text_from_docx(file_bytes: bytes) -> str:
    direct = _extract_text_from_docx_zip(file_bytes)
    if direct:
        return clean_extracted_text(direct)

    try:
        from docx import Document
    except ImportError as exc:
        raise ValueError("Missing dependency: python-docx. Install requirements.txt") from exc

    document = Document(BytesIO(file_bytes))
    raw = "\n".join(p.text for p in document.paragraphs if p.text and p.text.strip()).strip()
    return clean_extracted_text(raw)


def _extract_text_from_docx_zip(file_bytes: bytes) -> str:
    if not zipfile.is_zipfile(BytesIO(file_bytes)):
        return ""

    try:
        with zipfile.ZipFile(BytesIO(file_bytes)) as zf:
            names = zf.namelist()
            if "word/document.xml" not in names:
                return ""

            xml_parts = ["word/document.xml"]
            xml_parts += sorted(n for n in names if n.startswith("word/header") and n.endswith(".xml"))
            xml_parts += sorted(n for n in names if n.startswith("word/footer") and n.endswith(".xml"))

            blocks: list[str] = []
            for part in xml_parts:
                xml_data = zf.read(part)
                root = ElementTree.fromstring(xml_data)
                ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

                for paragraph in root.findall(".//w:p", ns):
                    runs = [t.text or "" for t in paragraph.findall(".//w:t", ns)]
                    line = "".join(runs).strip()
                    if line:
                        blocks.append(line)
            return "\n".join(blocks).strip()
    except Exception:
        return ""


def extract_text_from_doc(file_bytes: bytes) -> str:
    candidates: list[str] = []
    for encoding in ("utf-16-le", "cp1252", "latin-1"):
        try:
            decoded = file_bytes.decode(encoding, errors="ignore")
        except Exception:
            continue
        cleaned = _clean_legacy_doc_text(decoded)
        if cleaned:
            candidates.append(cleaned)

    if not candidates:
        return ""

    return clean_extracted_text(max(candidates, key=len))


def _clean_legacy_doc_text(text: str) -> str:
    text = re.sub(r"[\x00-\x08\x0b-\x1f]", " ", text)
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    filtered = [ln for ln in lines if ln and re.search(r"[A-Za-z0-9@]", ln)]
    merged = "\n".join(filtered)
    merged = re.sub(r"[ \t]{2,}", " ", merged)
    merged = re.sub(r"\n{3,}", "\n\n", merged)
    return merged.strip()


def extract_text_from_image_with_ai(file_bytes: bytes, mime_type: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return ""

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ValueError("Missing dependency: openai. Install requirements.txt") from exc

    client = OpenAI(api_key=api_key)
    image_b64 = base64.b64encode(file_bytes).decode("utf-8")

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Extract all readable text from this CV image. Keep line breaks and section headers.",
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime_type};base64,{image_b64}",
                    },
                ],
            }
        ],
    )
    return clean_extracted_text((response.output_text or "").strip())


def _extract_text_with_google_document_ai(file_bytes: bytes, mime_type: str) -> str:
    api_key = os.getenv("GOOGLE_API_KEY", "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return ""
    try:
        import google.generativeai as genai
    except Exception:
        return ""

    try:
        genai.configure(api_key=api_key)
        model_name = _select_google_model_for_generate_content(genai)
        if not model_name:
            return ""
        model = genai.GenerativeModel(model_name)
        prompt = (
            "Extract all readable text from this CV document. "
            "Keep line breaks and section headers. Return plain text only."
        )
        response = model.generate_content(
            [
                {"mime_type": mime_type, "data": file_bytes},
                prompt,
            ]
        )
        return clean_extracted_text(getattr(response, "text", "") or "")
    except Exception:
        return ""


def _select_google_model_for_generate_content(genai_module) -> str:
    preferred = [
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
        "gemini-1.5-pro-latest",
    ]
    try:
        available = []
        for m in genai_module.list_models():
            name = getattr(m, "name", "") or ""
            methods = set(getattr(m, "supported_generation_methods", []) or [])
            if "generateContent" in methods:
                available.append(name.replace("models/", ""))
        if not available:
            return preferred[0]
        for candidate in preferred:
            if candidate in available:
                return candidate
        return available[0]
    except Exception:
        return preferred[0]


def _is_low_quality_extraction(text: str) -> bool:
    cleaned = clean_extracted_text(text)
    if not cleaned:
        return True
    lines = [ln for ln in cleaned.splitlines() if ln.strip()]
    if len(lines) < 3:
        return True

    joined = _match_text(" ".join(lines[:12]))
    noise_hits = sum(1 for token in TECHNICAL_NOISE_TERMS if token in joined)
    has_cv_markers = any(
        k in joined
        for k in (
            "experience",
            "formation",
            "education",
            "compet",
            "skills",
            "profil",
            "resume",
        )
    )
    if noise_hits >= 3 and not has_cv_markers:
        return True
    return False


def default_cv() -> dict:
    return {
        "personal_info": {
            "first_name": "",
            "last_name": "",
            "email": "",
            "phone": "",
            "location": "",
            "linkedin": "",
        },
        "summary": "",
        "education": [],
        "experience": [],
        "skills": [],
        "languages": [],
        "certifications": [],
    }


def strict_cv_template() -> dict:
    return {
        "personal": {
            "firstName": "",
            "lastName": "",
            "email": "",
            "phone": "",
            "city": "",
            "linkedin": "",
        },
        "summary": "",
        "skills": [],
        "experience": [],
        "education": [],
    }


def to_strict_schema(cv: dict) -> dict:
    src = cv if isinstance(cv, dict) else {}
    out = strict_cv_template()

    personal_src = src.get("personal") or src.get("personal_info") or src.get("contact") or {}
    first_name = str(personal_src.get("firstName") or personal_src.get("first_name") or personal_src.get("prenom") or "")
    last_name = str(personal_src.get("lastName") or personal_src.get("last_name") or personal_src.get("nom") or "")
    out["personal"]["firstName"] = first_name.strip().title()
    out["personal"]["lastName"] = last_name.strip().upper()
    out["personal"]["email"] = str(personal_src.get("email") or "")
    out["personal"]["phone"] = str(personal_src.get("phone") or personal_src.get("telephone") or "")
    out["personal"]["city"] = str(personal_src.get("city") or personal_src.get("location") or personal_src.get("ville") or "")
    out["personal"]["linkedin"] = str(personal_src.get("linkedin") or "")

    out["summary"] = str(src.get("summary") or src.get("resume") or "")

    skills_src = src.get("skills") or src.get("competences") or []
    if isinstance(skills_src, list):
        out["skills"] = [str(s).strip() for s in skills_src if str(s).strip()]

    exp_src = src.get("experience") or src.get("experiences") or []
    if isinstance(exp_src, list):
        for e in exp_src:
            if not isinstance(e, dict):
                continue
            bullets = e.get("bullets") or e.get("highlights") or e.get("missions") or []
            if not isinstance(bullets, list):
                bullets = []
            out["experience"].append(
                {
                    "title": str(e.get("title") or e.get("poste") or ""),
                    "company": str(e.get("company") or e.get("entreprise") or ""),
                    "location": str(e.get("location") or e.get("lieu") or ""),
                    "startDate": str(e.get("startDate") or e.get("start_date") or e.get("date_debut") or ""),
                    "endDate": str(e.get("endDate") or e.get("end_date") or e.get("date_fin") or ""),
                    "bullets": [str(x).strip() for x in bullets if str(x).strip()],
                }
            )

    edu_src = src.get("education") or src.get("formation") or src.get("formations") or []
    if isinstance(edu_src, list):
        for e in edu_src:
            if not isinstance(e, dict):
                continue
            out["education"].append(
                {
                    "degree": str(e.get("degree") or e.get("diplome") or ""),
                    "school": str(e.get("school") or e.get("ecole") or e.get("universite") or ""),
                    "location": str(e.get("location") or e.get("ville") or ""),
                    "startDate": str(e.get("startDate") or e.get("start_date") or e.get("date_debut") or ""),
                    "endDate": str(e.get("endDate") or e.get("end_date") or e.get("date_fin") or ""),
                    "details": str(e.get("details") or e.get("description") or ""),
                }
            )

    # Regex authority for reliable contacts.
    full_text = " ".join(
        [
            out["summary"],
            " ".join(out["skills"]),
            " ".join(x.get("title", "") for x in out["experience"]),
            " ".join(x.get("school", "") for x in out["education"]),
        ]
    )
    if not out["personal"]["email"]:
        m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", full_text)
        out["personal"]["email"] = m.group(0) if m else ""
    if not out["personal"]["phone"]:
        m = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", full_text)
        out["personal"]["phone"] = m.group(0) if m else ""
    if not out["personal"]["linkedin"]:
        m = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s]+", full_text, flags=re.IGNORECASE)
        out["personal"]["linkedin"] = m.group(0) if m else ""

    # If name is still missing, infer from email local-part.
    if (not out["personal"]["firstName"] or not out["personal"]["lastName"]) and out["personal"]["email"]:
        local = out["personal"]["email"].split("@", 1)[0]
        parts = [p for p in re.split(r"[^A-Za-z]+", local) if p]
        if len(parts) >= 2:
            if not out["personal"]["firstName"]:
                out["personal"]["firstName"] = parts[0].title()
            if not out["personal"]["lastName"]:
                out["personal"]["lastName"] = " ".join(parts[1:]).upper()

    return out


def validate_strict_schema(cv: dict) -> bool:
    if not isinstance(cv, dict):
        return False
    expected_root = {"personal", "summary", "skills", "experience", "education"}
    if set(cv.keys()) != expected_root:
        return False
    if not isinstance(cv.get("personal"), dict):
        return False
    if set(cv["personal"].keys()) != {"firstName", "lastName", "email", "phone", "city", "linkedin"}:
        return False
    if not isinstance(cv.get("summary"), str):
        return False
    if not isinstance(cv.get("skills"), list):
        return False
    if not isinstance(cv.get("experience"), list):
        return False
    if not isinstance(cv.get("education"), list):
        return False
    for e in cv["experience"]:
        if not isinstance(e, dict):
            return False
        if set(e.keys()) != {"title", "company", "location", "startDate", "endDate", "bullets"}:
            return False
        if not isinstance(e["bullets"], list):
            return False
    for e in cv["education"]:
        if not isinstance(e, dict):
            return False
        if set(e.keys()) != {"degree", "school", "location", "startDate", "endDate", "details"}:
            return False
    return True


def _safe_json_loads(content: str) -> dict:
    text = (content or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass

    # Strip common markdown fences from LLM outputs.
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    # Keep only the biggest JSON object block.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    try:
        return json.loads(text)
    except Exception:
        return {}


def _normalize_personal_info(raw: dict, local: dict) -> dict:
    source = raw if isinstance(raw, dict) else {}
    fallback = local.get("personal_info", {}) if isinstance(local, dict) else {}

    result = {
        "first_name": str(source.get("first_name") or source.get("prenom") or fallback.get("first_name") or ""),
        "last_name": str(source.get("last_name") or source.get("nom") or fallback.get("last_name") or ""),
        "email": str(source.get("email") or fallback.get("email") or ""),
        "phone": str(source.get("phone") or source.get("telephone") or fallback.get("phone") or ""),
        "location": str(source.get("location") or source.get("ville") or fallback.get("location") or ""),
        "linkedin": str(source.get("linkedin") or fallback.get("linkedin") or ""),
    }
    return result


def _normalize_array(value) -> list:
    return value if isinstance(value, list) else []


def normalize_structured_cv(raw: dict, local: dict | None = None) -> dict:
    local = local or default_cv()
    src = raw if isinstance(raw, dict) else {}

    personal_raw = src.get("personal_info") or src.get("infos_personnelles") or src.get("contact") or {}
    summary_raw = src.get("summary") or src.get("resume") or src.get("profil") or ""
    skills_raw = src.get("skills") or src.get("competences") or []
    exp_raw = src.get("experience") or src.get("experiences") or src.get("experience_professionnelle") or []
    edu_raw = src.get("education") or src.get("formation") or src.get("formations") or []
    langs_raw = src.get("languages") or src.get("langues") or []
    certs_raw = src.get("certifications") or src.get("certification") or []

    out = default_cv()
    out["personal_info"] = _normalize_personal_info(personal_raw, local)
    out["summary"] = str(summary_raw or local.get("summary") or "")
    out["skills"] = [str(s).strip() for s in _normalize_array(skills_raw) if str(s).strip()] or local.get("skills", [])

    exp_list = []
    for e in _normalize_array(exp_raw):
        if not isinstance(e, dict):
            continue
        exp_list.append(
            {
                "company": str(e.get("company") or e.get("entreprise") or ""),
                "title": str(e.get("title") or e.get("poste") or ""),
                "start_date": str(e.get("start_date") or e.get("date_debut") or ""),
                "end_date": str(e.get("end_date") or e.get("date_fin") or ""),
                "location": str(e.get("location") or e.get("lieu") or ""),
                "highlights": [str(x).strip() for x in _normalize_array(e.get("highlights") or e.get("missions") or []) if str(x).strip()],
            }
        )
    out["experience"] = exp_list or local.get("experience", [])

    edu_list = []
    for e in _normalize_array(edu_raw):
        if not isinstance(e, dict):
            continue
        edu_list.append(
            {
                "school": str(e.get("school") or e.get("ecole") or e.get("universite") or ""),
                "degree": str(e.get("degree") or e.get("diplome") or ""),
                "field": str(e.get("field") or e.get("domaine") or ""),
                "start_date": str(e.get("start_date") or e.get("date_debut") or ""),
                "end_date": str(e.get("end_date") or e.get("date_fin") or ""),
                "details": str(e.get("details") or e.get("description") or ""),
            }
        )
    out["education"] = edu_list or local.get("education", [])
    out["languages"] = _normalize_array(langs_raw) or local.get("languages", [])
    out["certifications"] = _normalize_array(certs_raw) or local.get("certifications", [])
    return to_strict_schema(out)


def _llm_parse_with_google(cleaned_text: str, language_hint: str | None) -> dict:
    api_key = os.getenv("GOOGLE_API_KEY", "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {}
    try:
        import google.generativeai as genai
    except Exception:
        return {}

    try:
        genai.configure(api_key=api_key)
        model_name = _select_google_model_for_generate_content(genai)
        if not model_name:
            return {}
        model = genai.GenerativeModel(model_name)
        hint = f"Language hint: {language_hint}." if language_hint else ""
        prompt = (
            f"{hint}\n"
            "Extract CV data and return ONLY valid JSON with keys: "
            "personal, summary, skills, experience, education. "
            "personal = {firstName,lastName,email,phone,city,linkedin}. "
            "experience items = {title,company,location,startDate,endDate,bullets}. "
            "education items = {degree,school,location,startDate,endDate,details}. "
            "Do not add explanations. Missing values must be empty strings/arrays.\n\n"
            f"CV_TEXT:\n{cleaned_text}"
        )
        response = model.generate_content(prompt)
        content = getattr(response, "text", "") or ""
        return _safe_json_loads(content)
    except Exception:
        return {}


def _llm_parse_with_openai(cleaned_text: str, language_hint: str | None) -> dict:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {}
    try:
        from openai import OpenAI
    except Exception:
        return {}

    client = OpenAI(api_key=api_key)
    hint = f"Language hint from user: {language_hint}." if language_hint else ""
    schema = {
        "type": "object",
        "properties": {
            "personal": {"type": "object"},
            "summary": {"type": "string"},
            "education": {"type": "array"},
            "experience": {"type": "array"},
            "skills": {"type": "array"},
        },
    }
    try:
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You convert CV text into strict normalized JSON. "
                        "If information is missing, return empty strings or empty arrays. "
                        "Do not invent data."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"{hint}\n"
                        "Return ONLY JSON with keys: personal, summary, skills, experience, education. "
                        "personal fields: firstName,lastName,email,phone,city,linkedin. "
                        "experience fields: title,company,location,startDate,endDate,bullets. "
                        "education fields: degree,school,location,startDate,endDate,details. "
                        f"Expected shape: {json.dumps(schema, ensure_ascii=True)}\n\n"
                        f"CV_TEXT:\n{cleaned_text}"
                    ),
                },
            ],
        )
        return _safe_json_loads(completion.choices[0].message.content or "{}")
    except Exception:
        return {}


def _detect_header(line: str) -> str | None:
    norm = _match_text(line)
    norm = norm.strip(" :-|\t")
    norm = re.sub(r"\s+", " ", norm)

    if len(norm) > 60:
        return None

    for section, aliases in SECTION_HEADERS.items():
        for alias in aliases:
            if (
                norm == alias
                or norm.startswith(f"{alias}:")
                or norm.startswith(f"{alias} -")
                or norm.startswith(f"{alias} |")
                or f" {alias} " in f" {norm} "
            ):
                return section
    return None


def _split_sections(text: str) -> dict[str, list[str]]:
    sections = {"summary": [], "experience": [], "education": [], "skills": [], "other": []}
    current = "other"

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        header = _detect_header(line)
        if header:
            current = header
            continue

        sections[current].append(line)

    return sections


def _extract_dates(line: str) -> tuple[str, str]:
    normalized = _match_text(line)
    years = re.findall(r"\b(?:19|20)\d{2}\b", line)
    current_tokens = ("present", "current", "aujourd", "maintenant", "en cours")

    if len(years) >= 2:
        return years[0], years[1]

    if len(years) == 1:
        end = "Present" if any(tok in normalized for tok in current_tokens) else ""
        return years[0], end

    month_year = re.findall(
        r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|fev|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b",
        normalized,
    )
    if len(month_year) >= 2:
        return month_year[0], month_year[1]

    return "", ""


def _split_entry_blocks(lines: list[str]) -> list[list[str]]:
    if not lines:
        return []

    blocks: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        low = _match_text(line)
        is_new = False
        if current:
            if re.search(r"\b(?:19|20)\d{2}\b", line) and len(current) >= 2:
                is_new = True
            elif any(h in low for h in TITLE_HINTS) and len(current) >= 3:
                is_new = True
            elif any(h in low for h in DEGREE_HINTS) and len(current) >= 3:
                is_new = True

        if is_new:
            blocks.append(current)
            current = [line]
        else:
            current.append(line)

    if current:
        blocks.append(current)

    return blocks


def _looks_like_experience_line(line: str) -> bool:
    norm = _match_text(line)
    has_year = bool(re.search(r"\b(?:19|20)\d{2}\b", line))
    has_title = any(h in norm for h in TITLE_HINTS)
    has_sep = "|" in line or " - " in line or " @ " in line
    return has_year or (has_title and has_sep)


def _looks_like_education_line(line: str) -> bool:
    norm = _match_text(line)
    has_year = bool(re.search(r"\b(?:19|20)\d{2}\b", line))
    has_degree = any(h in norm for h in DEGREE_HINTS)
    school_tokens = ("universite", "university", "ecole", "school", "institut", "lycee", "college")
    has_school = any(t in norm for t in school_tokens)
    return has_degree or (has_school and has_year)


def _collect_fallback_blocks(lines: list[str], detector) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        if detector(line):
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            # attach nearby detail lines
            if len(current) < 5:
                current.append(line)
            else:
                blocks.append(current)
                current = []

    if current:
        blocks.append(current)

    return blocks[:6]


def _parse_experience(lines: list[str]) -> list[dict]:
    blocks = _split_entry_blocks(lines)
    if not blocks and lines:
        blocks = [lines]

    experience: list[dict] = []

    for block in blocks[:6]:
        head = block[0] if block else ""
        parts = re.split(r"\s+\|\s+|\s+-\s+|\s+@\s+", head, maxsplit=2)

        title = parts[0].strip() if parts else ""
        company = parts[1].strip() if len(parts) > 1 else ""
        location = parts[2].strip() if len(parts) > 2 else ""

        start_date, end_date = _extract_dates(" ".join(block[:2]))

        highlights = []
        for line in block[1:]:
            clean = re.sub(r"^[\-•*]\s*", "", line).strip()
            if clean and clean not in highlights:
                highlights.append(clean)

        if not highlights and len(block) == 1:
            highlights = [re.sub(r"^[\-•*]\s*", "", block[0]).strip()]

        if not company and len(block) > 1:
            guess = block[1]
            if len(guess.split()) <= 6:
                company = guess

        if title or company or highlights:
            experience.append(
                {
                    "company": company,
                    "title": title,
                    "start_date": start_date,
                    "end_date": end_date,
                    "location": location,
                    "highlights": highlights[:8],
                }
            )

    return experience


def _parse_education(lines: list[str]) -> list[dict]:
    blocks = _split_entry_blocks(lines)
    if not blocks and lines:
        blocks = [lines]

    education: list[dict] = []

    for block in blocks[:6]:
        head = block[0] if block else ""
        parts = re.split(r"\s+\|\s+|\s+-\s+", head, maxsplit=2)

        degree = parts[0].strip() if parts else ""
        school = parts[1].strip() if len(parts) > 1 else ""
        field = parts[2].strip() if len(parts) > 2 else ""

        if not school and len(block) > 1:
            school = block[1]

        start_date, end_date = _extract_dates(" ".join(block[:2]))
        details = " ".join(block[1:4]).strip()

        if school or degree or details:
            education.append(
                {
                    "school": school,
                    "degree": degree,
                    "field": field,
                    "start_date": start_date,
                    "end_date": end_date,
                    "details": details,
                }
            )

    return education


def _parse_skills(lines: list[str], fallback_lines: list[str]) -> list[str]:
    source = lines or [ln for ln in fallback_lines if "skill" in _match_text(ln) or "compet" in _match_text(ln)]
    tokens: list[str] = []

    for line in source:
        cleaned = re.sub(r"^[\-•*]\s*", "", line)
        cleaned = re.sub(r"^(skills|competences|competence|technologies|outils)\s*[:\-]\s*", "", _match_text(cleaned), flags=re.IGNORECASE)
        for part in re.split(r"[,;/|]", cleaned):
            skill = part.strip()
            if not skill:
                continue
            if len(skill) > 35:
                continue
            if re.fullmatch(r"(?:19|20)\d{2}", skill):
                continue
            tokens.append(skill)

    # Additional fallback: infer technical keywords even without explicit section header.
    if not tokens:
        for line in fallback_lines:
            low = _match_text(line)
            if _looks_like_name_line(line) or "@" in line:
                continue
            if "|" in line or "," in line or ";" in line:
                for part in re.split(r"[,;/|]", low):
                    skill = part.strip()
                    if skill in SKILL_HINT_TOKENS:
                        tokens.append(skill)
            else:
                words = [w.strip() for w in re.split(r"\s+", low) if w.strip()]
                for w in words:
                    if w in SKILL_HINT_TOKENS:
                        tokens.append(w)

    unique: list[str] = []
    seen = set()
    for token in tokens:
        norm = token.lower()
        if norm not in seen:
            seen.add(norm)
            unique.append(token)

    return unique[:30]


def parse_cv_text_locally(text: str) -> dict:
    cleaned_text = clean_extracted_text(text)
    cv = default_cv()

    if not cleaned_text:
        return cv

    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", cleaned_text)
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", cleaned_text)
    linkedin_match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s]+", cleaned_text, flags=re.IGNORECASE)

    all_lines = [ln.strip() for ln in cleaned_text.splitlines() if ln.strip()]
    sections = _split_sections(cleaned_text)

    if all_lines:
        first_line_parts = all_lines[0].split()
        if len(first_line_parts) >= 2 and "@" not in all_lines[0] and not _is_noise_line(all_lines[0]):
            cv["personal_info"]["first_name"] = first_line_parts[0]
            cv["personal_info"]["last_name"] = " ".join(first_line_parts[1:])

    cv["personal_info"]["email"] = email_match.group(0) if email_match else ""
    cv["personal_info"]["phone"] = phone_match.group(0) if phone_match else ""
    cv["personal_info"]["linkedin"] = linkedin_match.group(0) if linkedin_match else ""
    cv["personal_info"]["location"] = _extract_city_from_lines(all_lines)

    if not cv["personal_info"]["linkedin"]:
        cv["personal_info"]["linkedin"] = _extract_linkedin_fallback(cleaned_text)

    # If name is missing but email exists, infer a basic first/last name from local part.
    if (not cv["personal_info"]["first_name"] or not cv["personal_info"]["last_name"]) and cv["personal_info"]["email"]:
        local = cv["personal_info"]["email"].split("@", 1)[0]
        local = re.sub(r"[^A-Za-z]+", " ", local).strip()
        parts = [p for p in local.split() if p]
        if len(parts) >= 2:
            cv["personal_info"]["first_name"] = cv["personal_info"]["first_name"] or parts[0].capitalize()
            cv["personal_info"]["last_name"] = cv["personal_info"]["last_name"] or " ".join(p.capitalize() for p in parts[1:])

    summary_lines = sections["summary"]
    if summary_lines:
        filtered_summary = [
            ln
            for ln in summary_lines
            if _is_good_summary_line(ln) and not _looks_like_name_line(ln) and "linkedin" not in _match_text(ln)
        ]
        cv["summary"] = " ".join(filtered_summary[:4])
    else:
        fallback_summary = [
            ln
            for ln in sections["other"][:12]
            if _is_good_summary_line(ln)
            and not _looks_like_name_line(ln)
            and "linkedin" not in _match_text(ln)
            and "compet" not in _match_text(ln)
            and "skill" not in _match_text(ln)
        ]
        cv["summary"] = " ".join(fallback_summary[:2])

    # Hard guard: never keep technical metadata as summary.
    if cv["summary"] and _is_noise_line(cv["summary"]):
        cv["summary"] = ""

    cv["skills"] = _parse_skills(sections["skills"], all_lines)

    experience_lines = sections["experience"]
    education_lines = sections["education"]

    cv["experience"] = _parse_experience(experience_lines)
    cv["education"] = _parse_education(education_lines)

    # Fallback from full text if headers are missing or OCR/layout broke sections.
    if not cv["experience"]:
        exp_blocks = _collect_fallback_blocks(all_lines, _looks_like_experience_line)
        flattened_exp = [ln for block in exp_blocks for ln in block]
        cv["experience"] = _parse_experience(flattened_exp)

    if not cv["education"]:
        edu_blocks = _collect_fallback_blocks(all_lines, _looks_like_education_line)
        flattened_edu = [ln for block in edu_blocks for ln in block]
        cv["education"] = _parse_education(flattened_edu)

    # Minimum guarantees requested for common CVs: keep first parsed blocks when sections exist.
    if not cv["experience"] and experience_lines:
        cv["experience"] = [
            {
                "company": "",
                "title": "",
                "start_date": "",
                "end_date": "",
                "location": "",
                "highlights": experience_lines[:6],
            }
        ]

    if not cv["education"] and education_lines:
        cv["education"] = [
            {
                "school": "",
                "degree": "",
                "field": "",
                "start_date": "",
                "end_date": "",
                "details": " ".join(education_lines[:4]),
            }
        ]

    # Final fallback to satisfy minimum objective on regular CVs.
    if not cv["experience"]:
        year_lines = [ln for ln in all_lines if re.search(r"\b(?:19|20)\d{2}\b", ln)]
        if year_lines:
            cv["experience"] = [
                {
                    "company": "",
                    "title": "",
                    "start_date": "",
                    "end_date": "",
                    "location": "",
                    "highlights": year_lines[:4],
                }
            ]

    if not cv["education"]:
        edu_hint_lines = [ln for ln in all_lines if _looks_like_education_line(ln)]
        if edu_hint_lines:
            cv["education"] = [
                {
                    "school": "",
                    "degree": "",
                    "field": "",
                    "start_date": "",
                    "end_date": "",
                    "details": " ".join(edu_hint_lines[:3]),
                }
            ]

    return cv


def parse_cv_text_with_ai(text: str, language_hint: str | None = None) -> dict:
    cleaned_text = clean_extracted_text(text)
    local_legacy = parse_cv_text_locally(cleaned_text)
    local = to_strict_schema(local_legacy)
    # Priority: Google AI (if configured), then OpenAI, then local parser.
    parsed_google = _llm_parse_with_google(cleaned_text, language_hint)
    if parsed_google:
        strict_google = normalize_structured_cv(parsed_google, local_legacy)
        if validate_strict_schema(strict_google):
            return strict_google

    parsed_openai = _llm_parse_with_openai(cleaned_text, language_hint)
    if parsed_openai:
        strict_openai = normalize_structured_cv(parsed_openai, local_legacy)
        if validate_strict_schema(strict_openai):
            return strict_openai

    return local


def detect_sections_debug(text: str) -> dict:
    cleaned = clean_extracted_text(text)
    sections = _split_sections(cleaned)
    return {
        "summary": sections.get("summary", []),
        "skills": sections.get("skills", []),
        "experience": sections.get("experience", []),
        "education": sections.get("education", []),
    }


def detect_source_and_extract(file_name: str, content_type: str, data: bytes) -> tuple[str, str]:
    lower_name = (file_name or "").lower()
    mime = (content_type or "").lower()

    if mime == "application/pdf" or lower_name.endswith(".pdf"):
        raw = extract_text_from_pdf(data)
        if _is_low_quality_extraction(raw):
            ai_raw = _extract_text_with_google_document_ai(data, "application/pdf")
            if ai_raw:
                raw = ai_raw
        if _is_low_quality_extraction(raw):
            # Avoid returning binary garbage as CV text.
            raw = ""
        return "pdf", raw

    if (
        mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or mime == "application/vnd.ms-word.document.macroenabled.12"
        or lower_name.endswith(".docx")
    ):
        raw = extract_text_from_docx(data)
        if _is_low_quality_extraction(raw):
            ai_raw = _extract_text_with_google_document_ai(
                data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            if ai_raw:
                raw = ai_raw
        if _is_low_quality_extraction(raw):
            raw = ""
        return "docx", raw

    if mime == "application/msword" or lower_name.endswith(".doc"):
        raw = extract_text_from_doc(data)
        if _is_low_quality_extraction(raw):
            ai_raw = _extract_text_with_google_document_ai(data, "application/msword")
            if ai_raw:
                raw = ai_raw
        if _is_low_quality_extraction(raw):
            raw = ""
        return "doc", raw

    if mime in {"application/octet-stream", "application/zip"} and lower_name.endswith(".docx"):
        raw = extract_text_from_docx(data)
        if _is_low_quality_extraction(raw):
            ai_raw = _extract_text_with_google_document_ai(
                data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            if ai_raw:
                raw = ai_raw
        if _is_low_quality_extraction(raw):
            raw = ""
        return "docx", raw

    if mime.startswith("image/") or lower_name.endswith((".png", ".jpg", ".jpeg")):
        image_mime = mime if mime.startswith("image/") else "image/jpeg"
        return "image", extract_text_from_image_with_ai(data, image_mime)

    raise ValueError("Unsupported format. Use PDF, DOCX, DOC, JPG or PNG.")
