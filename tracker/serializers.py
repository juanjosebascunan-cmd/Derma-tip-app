from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Patient, Reminder, SkinEntry

User = get_user_model()


class CurrentUserSerializer(serializers.ModelSerializer):
    isStaff = serializers.BooleanField(source="is_staff")
    isSuperuser = serializers.BooleanField(source="is_superuser")

    class Meta:
        model = User
        fields = ["id", "username", "isStaff", "isSuperuser"]


class PatientSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name")

    class Meta:
        model = Patient
        fields = ["id", "fullName", "condition", "notes"]


class ReminderSerializer(serializers.ModelSerializer):
    patientId = serializers.IntegerField(source="patient_id", read_only=True)

    class Meta:
        model = Reminder
        fields = ["id", "patientId", "title", "detail", "done"]


class SkinEntrySerializer(serializers.ModelSerializer):
    patientId = serializers.IntegerField(source="patient_id")

    class Meta:
        model = SkinEntry
        fields = [
            "id",
            "patientId",
            "title",
            "date",
            "status",
            "severity",
            "pain",
            "symptoms",
            "triggers",
            "notes",
        ]


class BootstrapSerializer(serializers.Serializer):
    currentUser = CurrentUserSerializer(allow_null=True)
    patients = PatientSerializer(many=True)
    patient = PatientSerializer()
    reminders = ReminderSerializer(many=True)
    entries = SkinEntrySerializer(many=True)


class PatientMutationSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=160)
    condition = serializers.CharField(max_length=200)
    notes = serializers.CharField(allow_blank=True, required=False)


class EntryCreateSerializer(serializers.Serializer):
    patientId = serializers.IntegerField(required=False)
    date = serializers.DateField()
    severity = serializers.IntegerField(min_value=0, max_value=5)
    pain = serializers.IntegerField(min_value=0, max_value=5)
    symptoms = serializers.ListField(child=serializers.CharField(), allow_empty=False)
    triggers = serializers.ListField(child=serializers.CharField(), required=False)
    notes = serializers.CharField(allow_blank=True, required=False)


class ReminderUpdateSerializer(serializers.Serializer):
    done = serializers.BooleanField()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
