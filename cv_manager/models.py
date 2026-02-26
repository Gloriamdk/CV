from django.db import models


class Resume(models.Model):
    title = models.CharField(max_length=200, default="Mon CV")
    source = models.CharField(max_length=40, default="text")
    language = models.CharField(max_length=20, blank=True, default="")
    raw_text = models.TextField(blank=True, default="")
    cv_json = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

