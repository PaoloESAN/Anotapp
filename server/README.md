# Anotapp Sync Server (Elysia v2)

Servidor de sincronización en tiempo real y transferencia de archivos para **Anotapp** construido con [Elysia v2 (rc3)](https://elysiajs.com/) sobre [Bun](https://bun.sh/).

## Características

- **WebSockets de alto rendimiento:** Interconexión bidireccional instantánea entre dispositivos (Desktop, Web Lite, Móvil).
- **Salas de vinculación con código corto (6 caracteres):** Sin necesidad de cuentas ni registros.
- **Sin problemas de NAT/Firewalls:** A diferencia de WebRTC/PeerJS, funciona de forma continua entre diferentes conexiones WiFi, datos móviles (4G/5G) y sin interrupciones.
- **Soporte de archivos temporal:** API `POST /api/upload` y `GET /api/file/:id` para compartir fotos y archivos al instante.
- **Auto-limpieza:** Archivos y salas inactivas se limpian automáticamente periódicamente.

## Despliegue en Railway

### Opción 1: Despliegue directo desde GitHub
1. En tu panel de Railway, crea un nuevo proyecto: **New Project** > **Deploy from GitHub repo**.
2. Selecciona el repositorio `Anotapp`.
3. En la configuración del servicio en Railway (**Settings**):
   - **Root Directory:** Configúralo en `/server` (o déjalo en blanco si usas Dockerfile directo).
   - Railway detectará el `Dockerfile` y el `railway.json`.
4. En **Networking**, haz clic en **Generate Domain** para obtener tu URL pública (ejemplo: `https://anotapp-server-production.up.railway.app`).
5. Copia esa URL pública y configúrala como variable de entorno `PUBLIC_SERVER_URL` en tu aplicación cliente (Vercel o archivo `.env`).

## Desarrollo local

```bash
cd server
bun install
bun run dev
```

El servidor iniciará en `http://localhost:3000`.
