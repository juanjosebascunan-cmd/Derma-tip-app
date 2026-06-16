from django.contrib import admin

from .models import Patient, Reminder, SkinEntry


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("id", "full_name", "condition", "owner")
    search_fields = ("full_name", "condition")


@admin.register(Reminder)
class ReminderAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "patient", "done")
    list_filter = ("done",)
    search_fields = ("title", "patient__full_name")


@admin.register(SkinEntry)
class SkinEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "patient", "date", "status", "severity", "pain")
    list_filter = ("status", "date")
    search_fields = ("title", "patient__full_name", "notes")
