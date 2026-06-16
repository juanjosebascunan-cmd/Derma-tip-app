import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.contrib.auth import get_user_model


def main() -> None:
    username = os.getenv("DJANGO_SUPERUSER_USERNAME")
    password = os.getenv("DJANGO_SUPERUSER_PASSWORD")
    email = os.getenv("DJANGO_SUPERUSER_EMAIL", "")

    if not username or not password:
        print("superuser-skipped")
        return

    user_model = get_user_model()
    user = user_model.objects.filter(username=username).first()

    if user is None:
        user_model.objects.create_superuser(username=username, email=email, password=password)
        print("superuser-created")
        return

    changed = False

    if email and user.email != email:
        user.email = email
        changed = True

    if not user.is_staff:
        user.is_staff = True
        changed = True

    if not user.is_superuser:
        user.is_superuser = True
        changed = True

    user.set_password(password)
    changed = True

    if changed:
        user.save()
        print("superuser-updated")
        return

    print("superuser-skipped")


if __name__ == "__main__":
    main()
