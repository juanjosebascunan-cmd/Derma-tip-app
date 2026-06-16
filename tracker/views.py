from django.contrib.auth import authenticate, login, logout
from django.http import HttpResponse
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Reminder, SkinEntry
from .serializers import (
    BootstrapSerializer,
    CurrentUserSerializer,
    EntryCreateSerializer,
    LoginSerializer,
    PatientMutationSerializer,
    PatientSerializer,
    ReminderSerializer,
    ReminderUpdateSerializer,
    SkinEntrySerializer,
)
from .services import (
    build_patients_csv,
    create_default_reminders_for_patient,
    ensure_bootstrap_data,
    patient_for_user,
    patient_queryset_for_user,
    primary_patient_for_user,
)


def _get_status_label(severity: int) -> str:
    if severity >= 4:
        return "Brote"
    if severity <= 1:
        return "Estable"
    return "Recuperacion"


def _get_title_from_payload(payload: dict) -> str:
    lead = payload.get("symptoms", ["Seguimiento general"])[0]
    trigger = payload.get("triggers", [None])[0]
    return f"{lead} con posible detonante: {trigger}" if trigger else lead


def _current_user_payload(request):
    return request.user if request.user.is_authenticated else None


def _auth_required_response():
    return Response(
        {"message": "Inicia sesion para guardar y administrar pacientes."},
        status=status.HTTP_401_UNAUTHORIZED,
    )


@api_view(["GET"])
def csrf_view(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["GET"])
def me_view(request):
    serializer = CurrentUserSerializer(_current_user_payload(request))
    return Response({"currentUser": serializer.data if serializer.instance else None})


@api_view(["POST"])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = authenticate(
        request,
        username=serializer.validated_data["username"],
        password=serializer.validated_data["password"],
    )

    if user is None:
        return Response({"message": "Credenciales invalidas."}, status=status.HTTP_400_BAD_REQUEST)

    login(request, user)
    get_token(request)
    return Response({"currentUser": CurrentUserSerializer(user).data})


@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response({"ok": True})


@api_view(["GET"])
def health_view(_request):
    return Response({"ok": True})


@api_view(["GET"])
def bootstrap_view(request):
    ensure_bootstrap_data()
    requested_patient_id = request.query_params.get("patientId")
    patients = patient_queryset_for_user(request.user)
    patient = patient_for_user(request.user, requested_patient_id) if requested_patient_id else primary_patient_for_user(request.user)

    if patient is None:
        return Response({"message": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

    payload = {
        "currentUser": _current_user_payload(request),
        "patients": patients,
        "patient": patient,
        "reminders": patient.reminders.all(),
        "entries": patient.entries.all(),
    }
    serializer = BootstrapSerializer(payload)
    return Response(serializer.data)


@api_view(["GET"])
def meta_view(_request):
    return Response({"storage": "sqlite", "databaseFile": "backend/db.sqlite3", "framework": "django"})


@api_view(["GET", "POST"])
def patients_view(request):
    ensure_bootstrap_data()

    if request.method == "GET":
        serializer = PatientSerializer(patient_queryset_for_user(request.user), many=True)
        return Response(serializer.data)

    if not request.user.is_authenticated:
        return _auth_required_response()

    serializer = PatientMutationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    patient = PatientSerializer.Meta.model.objects.create(
        owner=request.user if request.user.is_authenticated else None,
        full_name=serializer.validated_data["fullName"],
        condition=serializer.validated_data["condition"],
        notes=serializer.validated_data.get("notes", ""),
    )
    create_default_reminders_for_patient(patient)

    return Response(PatientSerializer(patient).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def patient_detail_view(request, patient_id: int):
    ensure_bootstrap_data()
    if not request.user.is_authenticated:
        return _auth_required_response()

    patient = patient_for_user(request.user, patient_id)

    if patient is None:
        return Response({"message": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        serializer = PatientMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient.full_name = serializer.validated_data["fullName"]
        patient.condition = serializer.validated_data["condition"]
        patient.notes = serializer.validated_data.get("notes", "")
        patient.save(update_fields=["full_name", "condition", "notes"])
        return Response(PatientSerializer(patient).data)

    if patient_queryset_for_user(request.user).count() <= 1:
        return Response(
            {"message": "Debe existir al menos un paciente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    deleted_id = patient.id
    patient.delete()
    return Response({"deletedId": deleted_id})


@api_view(["POST"])
def create_entry_view(request):
    ensure_bootstrap_data()
    if not request.user.is_authenticated:
        return _auth_required_response()

    serializer = EntryCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    patient_id = serializer.validated_data.get("patientId")
    patient = patient_for_user(request.user, patient_id) if patient_id else primary_patient_for_user(request.user)

    if patient is None:
        return Response({"message": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

    entry = SkinEntry.objects.create(
        patient=patient,
        title=_get_title_from_payload(serializer.validated_data),
        date=serializer.validated_data["date"],
        status=_get_status_label(serializer.validated_data["severity"]),
        severity=serializer.validated_data["severity"],
        pain=serializer.validated_data["pain"],
        symptoms=serializer.validated_data["symptoms"],
        triggers=serializer.validated_data.get("triggers", []),
        notes=(serializer.validated_data.get("notes") or "Sin notas adicionales.").strip()
        or "Sin notas adicionales.",
    )

    return Response(SkinEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
def update_reminder_view(request, reminder_id: int):
    ensure_bootstrap_data()
    if not request.user.is_authenticated:
        return _auth_required_response()

    reminder = Reminder.objects.filter(
        pk=reminder_id, patient__in=patient_queryset_for_user(request.user)
    ).first()

    if reminder is None:
        return Response({"message": "Reminder not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = ReminderUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    reminder.done = serializer.validated_data["done"]
    reminder.save(update_fields=["done"])

    return Response(ReminderSerializer(reminder).data)


@api_view(["GET"])
def export_patients_csv_view(request):
    if not request.user.is_authenticated:
        return _auth_required_response()

    patients = patient_queryset_for_user(request.user).prefetch_related("entries")
    csv_content = build_patients_csv(patients)
    response = HttpResponse(csv_content, content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="dermatip-patients-export.csv"'
    return response
