import csv
import io
import sqlite3
from pathlib import Path

from django.contrib.auth.models import AnonymousUser
from django.db import transaction
from django.db.models import QuerySet

from .models import Patient, Reminder, SkinEntry

DEFAULT_PATIENT = {
    "full_name": "Paciente Dermatip",
    "condition": "Dermatitis atopica / Rosacea",
    "notes": "Seguimiento personal inicial para detectar detonantes, sintomas y progreso diario.",
}

DEFAULT_REMINDERS = [
    {"title": "Hidratacion", "detail": "Tomar 250 ml de agua ahora", "done": True},
    {"title": "Aplicar crema", "detail": "Rutina de mediodia", "done": True},
    {"title": "Limpieza suave", "detail": "Usar producto sin fragancia por la noche", "done": False},
]

DEFAULT_ENTRIES = [
    {
        "title": "Enrojecimiento leve en mejillas",
        "date": "2026-06-15",
        "status": "Recuperacion",
        "severity": 2,
        "pain": 1,
        "symptoms": ["Enrojecimiento", "Picor"],
        "triggers": ["Estres"],
        "notes": "Mejoro despues de descansar y aplicar crema barrera.",
    },
    {
        "title": "Brote nocturno moderado",
        "date": "2026-06-13",
        "status": "Brote",
        "severity": 4,
        "pain": 3,
        "symptoms": ["Picor", "Inflamacion", "Resequedad"],
        "triggers": ["Clima", "Falta de sueno"],
        "notes": "Hubo calor durante la tarde y dormi mal.",
    },
    {
        "title": "Dia estable",
        "date": "2026-06-10",
        "status": "Estable",
        "severity": 1,
        "pain": 0,
        "symptoms": ["Resequedad"],
        "triggers": ["Nuevo producto"],
        "notes": "Sin crisis, solo resequedad ligera en la frente.",
    },
]


def get_express_db_path() -> Path:
    return Path(__file__).resolve().parent.parent / "server" / "data" / "dermatip.db"


def ensure_bootstrap_data() -> None:
    if Patient.objects.exists():
        return

    imported = import_from_express_sqlite()
    if imported:
        return

    seed_defaults()


def import_from_express_sqlite() -> bool:
    db_path = get_express_db_path()
    if not db_path.exists():
        return False

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row

    try:
        patient_rows = connection.execute(
            "SELECT id, full_name, condition_name, notes FROM patients ORDER BY id ASC"
        ).fetchall()
        reminder_rows = connection.execute(
            "SELECT id, patient_id, title, detail, done FROM reminders ORDER BY id ASC"
        ).fetchall()
        entry_rows = connection.execute(
            """
            SELECT id, patient_id, title, date, status, severity, pain, symptoms, triggers, notes
            FROM entries
            ORDER BY date DESC, id DESC
            """
        ).fetchall()
    except sqlite3.Error:
        return False
    finally:
        connection.close()

    if not patient_rows:
        return False

    with transaction.atomic():
        patient_map: dict[str, Patient] = {}

        for row in patient_rows:
            patient = Patient.objects.create(
                full_name=row["full_name"],
                condition=row["condition_name"],
                notes=row["notes"],
            )
            patient_map[str(row["id"])] = patient

        for row in reminder_rows:
            patient = patient_map.get(str(row["patient_id"]))
            if patient is None:
                continue

            Reminder.objects.create(
                patient=patient,
                title=row["title"],
                detail=row["detail"],
                done=bool(row["done"]),
            )

        for row in entry_rows:
            patient = patient_map.get(str(row["patient_id"]))
            if patient is None:
                continue

            SkinEntry.objects.create(
                patient=patient,
                title=row["title"],
                date=row["date"],
                status=row["status"],
                severity=row["severity"],
                pain=row["pain"],
                symptoms=_parse_json_array(row["symptoms"]),
                triggers=_parse_json_array(row["triggers"]),
                notes=row["notes"],
            )

    return True


def seed_defaults() -> None:
    with transaction.atomic():
        create_default_patient()


def _parse_json_array(value: str) -> list[str]:
    import json

    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def is_authenticated_user(user) -> bool:
    return bool(user and not isinstance(user, AnonymousUser) and user.is_authenticated)


def create_default_patient(owner=None) -> Patient:
    patient = Patient.objects.create(owner=owner, **DEFAULT_PATIENT)
    create_default_reminders_for_patient(patient)

    for entry in DEFAULT_ENTRIES:
        SkinEntry.objects.create(patient=patient, **entry)

    return patient


def ensure_guest_patient() -> Patient:
    patient = Patient.objects.filter(owner__isnull=True).order_by("id").first()
    if patient is not None:
        return patient

    return create_default_patient()


def clone_patient_for_owner(template: Patient, owner) -> Patient:
    patient = Patient.objects.create(
        owner=owner,
        full_name=template.full_name,
        condition=template.condition,
        notes=template.notes,
    )

    for reminder in template.reminders.all():
        Reminder.objects.create(
            patient=patient,
            title=reminder.title,
            detail=reminder.detail,
            done=reminder.done,
        )

    for entry in template.entries.all():
        SkinEntry.objects.create(
            patient=patient,
            title=entry.title,
            date=entry.date,
            status=entry.status,
            severity=entry.severity,
            pain=entry.pain,
            symptoms=entry.symptoms,
            triggers=entry.triggers,
            notes=entry.notes,
        )

    return patient


def bootstrap_patients_for_user(user) -> None:
    if not is_authenticated_user(user):
        return

    if Patient.objects.filter(owner=user).exists():
        return

    unowned_patients = Patient.objects.filter(owner__isnull=True).order_by("id")
    owned_patients_exist = Patient.objects.filter(owner__isnull=False).exists()

    with transaction.atomic():
        if unowned_patients.exists() and not owned_patients_exist:
            unowned_patients.update(owner=user)
            create_default_patient()
            return

        template = unowned_patients.first()
        if template is not None:
            clone_patient_for_owner(template, user)
            return

        create_default_patient(owner=user)
        create_default_patient()


def patient_queryset_for_user(user) -> QuerySet[Patient]:
    ensure_bootstrap_data()

    if is_authenticated_user(user):
        bootstrap_patients_for_user(user)
        return Patient.objects.filter(owner=user).order_by("full_name", "id")

    ensure_guest_patient()
    return Patient.objects.filter(owner__isnull=True).order_by("full_name", "id")


def primary_patient_for_user(user) -> Patient | None:
    return patient_queryset_for_user(user).order_by("id").first()


def patient_for_user(user, patient_id) -> Patient | None:
    return patient_queryset_for_user(user).filter(pk=patient_id).first()


def create_default_reminders_for_patient(patient: Patient) -> None:
    for reminder in DEFAULT_REMINDERS:
        Reminder.objects.create(patient=patient, **reminder)


def build_patients_csv(patients: QuerySet[Patient] | list[Patient]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "patient_id",
            "patient_name",
            "condition",
            "patient_notes",
            "entry_id",
            "date",
            "title",
            "status",
            "severity",
            "pain",
            "symptoms",
            "triggers",
            "entry_notes",
        ]
    )

    patient_list = list(patients)
    for patient in patient_list:
        entries = list(patient.entries.all())

        if not entries:
            writer.writerow(
                [
                    patient.id,
                    patient.full_name,
                    patient.condition,
                    patient.notes,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                ]
            )
            continue

        for entry in entries:
            writer.writerow(
                [
                    patient.id,
                    patient.full_name,
                    patient.condition,
                    patient.notes,
                    entry.id,
                    entry.date,
                    entry.title,
                    entry.status,
                    entry.severity,
                    entry.pain,
                    " | ".join(entry.symptoms),
                    " | ".join(entry.triggers),
                    entry.notes,
                ]
            )

    return output.getvalue()
