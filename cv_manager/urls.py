from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("templates", views.templates_page, name="templates-page"),
    path("api/parse-cv", views.parse_cv, name="parse-cv"),
    path("api/save-cv", views.save_cv, name="save-cv"),
    path("api/export-pdf", views.export_cv_pdf, name="export-pdf"),
    path("api/cv-list", views.cv_list, name="cv-list"),
    path("api/cv/<int:cv_id>", views.cv_detail, name="cv-detail"),
]

