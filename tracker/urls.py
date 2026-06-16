from django.urls import path

from .views import (
    csrf_view,
    bootstrap_view,
    create_entry_view,
    export_patients_csv_view,
    health_view,
    login_view,
    logout_view,
    me_view,
    meta_view,
    patient_detail_view,
    patients_view,
    update_reminder_view,
)

urlpatterns = [
    path("auth/csrf", csrf_view),
    path("auth/me", me_view),
    path("auth/login", login_view),
    path("auth/logout", logout_view),
    path("health", health_view),
    path("bootstrap", bootstrap_view),
    path("meta", meta_view),
    path("patients", patients_view),
    path("patients/<int:patient_id>", patient_detail_view),
    path("entries", create_entry_view),
    path("reminders/<int:reminder_id>", update_reminder_view),
    path("exports/patients.csv", export_patients_csv_view),
]
