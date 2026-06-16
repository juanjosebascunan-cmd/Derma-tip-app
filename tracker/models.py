from django.conf import settings
from django.db import models


class Patient(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients",
    )
    full_name = models.CharField(max_length=160)
    condition = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self) -> str:
        return self.full_name


class Reminder(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="reminders")
    title = models.CharField(max_length=120)
    detail = models.CharField(max_length=255)
    done = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]

    def __str__(self) -> str:
        return f"{self.patient.full_name}: {self.title}"


class SkinEntry(models.Model):
    class Status(models.TextChoices):
        FLARE = "Brote", "Brote"
        STABLE = "Estable", "Estable"
        RECOVERY = "Recuperacion", "Recuperacion"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="entries")
    title = models.CharField(max_length=200)
    date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices)
    severity = models.PositiveSmallIntegerField()
    pain = models.PositiveSmallIntegerField()
    symptoms = models.JSONField(default=list)
    triggers = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name_plural = "Skin entries"

    def __str__(self) -> str:
        return f"{self.patient.full_name}: {self.title} ({self.date})"
