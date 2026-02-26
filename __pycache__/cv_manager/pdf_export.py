from io import BytesIO


def _template_palette(template_name: str) -> dict:
    from reportlab.lib import colors

    palettes = {
        "simple": {
            "accent": colors.HexColor("#1f2937"),
            "subtle": colors.HexColor("#4b5563"),
            "line": colors.HexColor("#d1d5db"),
        },
        "modern": {
            "accent": colors.HexColor("#0f766e"),
            "subtle": colors.HexColor("#155e75"),
            "line": colors.HexColor("#99f6e4"),
        },
        "elegant": {
            "accent": colors.HexColor("#7c2d12"),
            "subtle": colors.HexColor("#78350f"),
            "line": colors.HexColor("#fcd34d"),
        },
    }
    return palettes.get(template_name, palettes["simple"])


def build_cv_pdf(cv: dict, template_name: str = "simple", title: str = "CV") -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except Exception as exc:
        raise ValueError("Missing dependency: reportlab. Install requirements.txt") from exc

    palette = _template_palette(template_name)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=28, leftMargin=28, topMargin=28, bottomMargin=28)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=palette["accent"],
        spaceAfter=8,
    )
    section_style = ParagraphStyle(
        "SectionStyle",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=palette["subtle"],
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
    )

    story = []
    personal = cv.get("personal", {}) if isinstance(cv, dict) else {}
    full_name = f"{personal.get('firstName', '')} {personal.get('lastName', '')}".strip() or title
    contact_line = " | ".join(
        [x for x in [personal.get("city", ""), personal.get("phone", ""), personal.get("email", ""), personal.get("linkedin", "")] if x]
    )

    story.append(Paragraph(full_name, title_style))
    if contact_line:
        story.append(Paragraph(contact_line, body_style))
        story.append(Spacer(1, 8))

    summary = (cv.get("summary", "") or "").strip()
    if summary:
        story.append(Paragraph("Profil", section_style))
        story.append(Paragraph(summary, body_style))

    experience = cv.get("experience", []) if isinstance(cv.get("experience"), list) else []
    if experience:
        story.append(Paragraph("Experiences", section_style))
        for exp in experience:
            line = f"<b>{exp.get('title', '')}</b> - {exp.get('company', '')}"
            dates = f"{exp.get('startDate', '')} - {exp.get('endDate', '')}".strip(" -")
            location = exp.get("location", "")
            details = " | ".join([x for x in [location, dates] if x])
            story.append(Paragraph(line, body_style))
            if details:
                story.append(Paragraph(details, body_style))
            bullets = exp.get("bullets", []) if isinstance(exp.get("bullets"), list) else []
            for bullet in bullets:
                story.append(Paragraph(f"• {bullet}", body_style))
            story.append(Spacer(1, 4))

    skills = cv.get("skills", []) if isinstance(cv.get("skills"), list) else []
    if skills:
        story.append(Paragraph("Competences", section_style))
        chips = ", ".join([str(s) for s in skills if str(s).strip()])
        story.append(Paragraph(chips, body_style))

    education = cv.get("education", []) if isinstance(cv.get("education"), list) else []
    if education:
        story.append(Paragraph("Formations", section_style))
        rows = []
        for edu in education:
            left = f"<b>{edu.get('degree', '')}</b><br/>{edu.get('school', '')}"
            right_parts = [edu.get("location", ""), f"{edu.get('startDate', '')} - {edu.get('endDate', '')}".strip(" -")]
            right = "<br/>".join([p for p in right_parts if p])
            rows.append([Paragraph(left, body_style), Paragraph(right, body_style)])
            details = (edu.get("details", "") or "").strip()
            if details:
                rows.append([Paragraph(details, body_style), Paragraph("", body_style)])

        table = Table(rows, colWidths=[350, 170])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.25, palette["line"]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(table)

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
