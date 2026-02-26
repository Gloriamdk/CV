import json

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Resume
from .pdf_export import build_cv_pdf
from .services import detect_sections_debug, detect_source_and_extract, parse_cv_text_with_ai, validate_strict_schema


def index(request: HttpRequest):
    return render(request, "cv_manager/index.html")


def templates_page(request: HttpRequest):
    return render(request, "cv_manager/templates_page.html")


@csrf_exempt
@require_POST
def parse_cv(request: HttpRequest) -> JsonResponse:
    upload = request.FILES.get("file")
    language_hint = request.POST.get("language_hint") or None

    if not upload:
        return JsonResponse({"detail": "file is required"}, status=400)

    data = upload.read()
    if not data:
        return JsonResponse({"detail": "Empty file"}, status=400)

    try:
        source, raw_text = detect_source_and_extract(upload.name, upload.content_type or "", data)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse({"detail": f"Unexpected extraction error: {exc}"}, status=500)

    if not raw_text.strip():
        return JsonResponse(
            {
                "detail": (
                    "No readable text extracted from this file. "
                    "If this is a scanned image-based Word/PDF, enable GOOGLE_API_KEY (or GEMINI_API_KEY) for OCR "
                    "or re-export the CV as a text-based DOCX/PDF."
                ),
            },
            status=422,
        )

    try:
        cv_json = parse_cv_text_with_ai(raw_text, language_hint)
    except Exception as exc:
        return JsonResponse({"detail": f"Unexpected parsing error: {exc}"}, status=500)
    debug_sections = detect_sections_debug(raw_text)

    if not validate_strict_schema(cv_json):
        return JsonResponse(
            {
                "detail": "Parsing failed: output does not match strict schema.",
                "debug_raw_text": raw_text,
                "debug_sections": debug_sections,
            },
            status=422,
        )

    return JsonResponse(
        {
            "source": source,
            "language": language_hint,
            "raw_text": raw_text,
            "cv": cv_json,
            "debug_raw_text": raw_text,
            "debug_sections": debug_sections,
        }
    )


@csrf_exempt
@require_POST
def save_cv(request: HttpRequest) -> JsonResponse:
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    title = str(payload.get("title") or "Mon CV")
    source = str(payload.get("source") or "text")
    language = str(payload.get("language") or "")
    raw_text = str(payload.get("raw_text") or "")
    cv = payload.get("cv") or {}

    doc = Resume.objects.create(
        title=title,
        source=source,
        language=language,
        raw_text=raw_text,
        cv_json=cv,
    )

    return JsonResponse(
        {
            "id": doc.id,
            "title": doc.title,
            "source": doc.source,
            "language": doc.language,
            "created_at": doc.created_at.isoformat(),
            "updated_at": doc.updated_at.isoformat(),
        }
    )


@csrf_exempt
@require_POST
def export_cv_pdf(request: HttpRequest) -> HttpResponse:
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    cv = payload.get("cv")
    template = str(payload.get("template") or "simple")
    title = str(payload.get("title") or "cv")

    if not isinstance(cv, dict):
        return JsonResponse({"detail": "cv object is required"}, status=400)

    try:
        pdf_bytes = build_cv_pdf(cv, template, title)
    except Exception as exc:
        return JsonResponse({"detail": f"PDF export failed: {exc}"}, status=500)
    filename = f"{title.replace(' ', '_')}_{template}.pdf"
    return HttpResponse(
        pdf_bytes,
        content_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@require_GET
def cv_list(request: HttpRequest) -> JsonResponse:
    docs = Resume.objects.all()
    return JsonResponse(
        [
            {
                "id": d.id,
                "title": d.title,
                "source": d.source,
                "language": d.language,
                "created_at": d.created_at.isoformat(),
                "updated_at": d.updated_at.isoformat(),
            }
            for d in docs
        ],
        safe=False,
    )


@require_GET
def cv_detail(request: HttpRequest, cv_id: int) -> JsonResponse:
    doc = get_object_or_404(Resume, id=cv_id)
    return JsonResponse(
        {
            "id": doc.id,
            "title": doc.title,
            "source": doc.source,
            "language": doc.language,
            "raw_text": doc.raw_text,
            "cv": doc.cv_json,
            "created_at": doc.created_at.isoformat(),
            "updated_at": doc.updated_at.isoformat(),
        }
    )


