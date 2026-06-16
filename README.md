# DermaTip App

Aplicacion PWA para seguimiento de brotes y cuidado de la piel.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Django + Django REST Framework
- Base de datos local: SQLite
- Demo remota: Render Postgres + Vercel frontend

## Desarrollo local

```bash
npm install
npm run dev
```

- Frontend local: `http://127.0.0.1:5173`
- Backend local: `http://127.0.0.1:8000`

## Deploy demo gratis

### Frontend en Vercel

- Framework: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Variable: `VITE_API_BASE_URL=https://TU-BACKEND.onrender.com`

### Backend en Render

El repo ya incluye:

- [build.sh](C:/Users/Juanj/OneDrive/Desktop/Dermatip-App/build.sh)
- [render.yaml](C:/Users/Juanj/OneDrive/Desktop/Dermatip-App/render.yaml)

Variables esperadas en Render:

- `SECRET_KEY`
- `DEBUG=false`
- `DATABASE_URL`
- `FRONTEND_ORIGINS=https://derma-tip-app.vercel.app`
- `DJANGO_SUPERUSER_USERNAME=tu_usuario`
- `DJANGO_SUPERUSER_PASSWORD=tu_password`
- `DJANGO_SUPERUSER_EMAIL=tu_correo@ejemplo.com`

Comandos:

- Build: `bash build.sh`
- Start: `gunicorn --chdir backend config.wsgi:application`

## Notas

- En Render gratis, el servicio web entra en reposo tras inactividad.
- La base de datos Postgres gratis sirve para demo, pero Render la limita en tiempo.
- Si no tienes acceso a Shell en Render, el deploy crea o actualiza el superusuario usando las variables `DJANGO_SUPERUSER_*`.
