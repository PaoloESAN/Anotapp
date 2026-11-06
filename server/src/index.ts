import { Elysia, t } from "elysia";
import { websocket } from "elysia/websocket";
import { cors } from "@elysiajs/cors";

interface ConnectedDevice {
  id: string;
  role: "host" | "client";
  deviceType: "desktop" | "mobile" | "web";
  connectedAt: number;
}

interface RoomInfo {
  code: string;
  createdAt: number;
  lastActive: number;
  devices: Map<string, ConnectedDevice>;
}

interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: Buffer;
  createdAt: number;
}

const rooms = new Map<string, RoomInfo>();
const fileStore = new Map<string, StoredFile>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Evita 0, O, 1, I para evitar confusión
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getOrCreateRoom(code: string): RoomInfo {
  const upper = code.trim().toUpperCase();
  let room = rooms.get(upper);
  if (!room) {
    room = {
      code: upper,
      createdAt: Date.now(),
      lastActive: Date.now(),
      devices: new Map(),
    };
    rooms.set(upper, room);
  }
  room.lastActive = Date.now();
  return room;
}

// Limpieza periódica de archivos antiguos (> 2 horas) y salas inactivas (> 12 horas)
setInterval(() => {
  const now = Date.now();
  for (const [id, file] of fileStore.entries()) {
    if (now - file.createdAt > 2 * 60 * 60 * 1000) {
      fileStore.delete(id);
    }
  }
  for (const [code, room] of rooms.entries()) {
    if (room.devices.size === 0 && now - room.lastActive > 12 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

const port = Number(process.env.PORT || 3000);
const rawCorsOrigin = process.env.CORS_ORIGIN?.trim() || "*";

// Permitir múltiples orígenes separados por coma, comodín '*' o un origen único
const corsOrigin = rawCorsOrigin === "*"
  ? true
  : rawCorsOrigin.includes(",")
    ? rawCorsOrigin.split(",").map(o => o.trim()).filter(Boolean)
    : rawCorsOrigin;

export const app = new Elysia()
  .use(cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }))
  .use(websocket())
  .get("/", () => ({
    name: "Anotapp Sync Server",
    status: "ok",
    version: "2.0.0-rc.3",
    timestamp: Date.now(),
    stats: {
      activeRooms: rooms.size,
      cachedFiles: fileStore.size,
    },
  }))
  .get("/health", () => ({ status: "ok", timestamp: Date.now() }))
  // Crear o reclamar una sala
  .post("/api/room", ({ body }) => {
    let desiredCode = (body as any)?.code?.trim()?.toUpperCase();
    if (!desiredCode || desiredCode.length < 4) {
      let attempts = 0;
      do {
        desiredCode = generateRoomCode();
        attempts++;
      } while (rooms.has(desiredCode) && attempts < 10);
    }

    const room = getOrCreateRoom(desiredCode);
    return {
      success: true,
      code: room.code,
      createdAt: room.createdAt,
      deviceCount: room.devices.size,
    };
  })
  // Verificar estado de una sala
  .get("/api/room/:code", ({ params, set }) => {
    const code = params.code.trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      set.status = 404;
      return { success: false, error: "Sala no encontrada" };
    }
    return {
      success: true,
      code: room.code,
      deviceCount: room.devices.size,
      hasHost: Array.from(room.devices.values()).some((d) => d.role === "host"),
    };
  })
  // Subida de archivos para sincronización rápida entre dispositivos
  .post("/api/upload", async ({ body, set }) => {
    const file = (body as any)?.file as File | undefined;
    if (!file) {
      set.status = 400;
      return { success: false, error: "No se proporcionó ningún archivo" };
    }

    try {
      const fileId = crypto.randomUUID();
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored: StoredFile = {
        id: fileId,
        name: file.name || "archivo",
        type: file.type || "application/octet-stream",
        size: buffer.byteLength,
        data: buffer,
        createdAt: Date.now(),
      };

      fileStore.set(fileId, stored);

      return {
        success: true,
        fileId,
        name: stored.name,
        type: stored.type,
        size: stored.size,
        downloadUrl: `/api/file/${fileId}`,
      };
    } catch (err: any) {
      set.status = 500;
      return { success: false, error: "Error procesando archivo: " + err.message };
    }
  })
  // Descarga de archivo sincronizado
  .get("/api/file/:id", ({ params, set }) => {
    const file = fileStore.get(params.id);
    if (!file) {
      set.status = 404;
      return "Archivo no encontrado o expirado";
    }

    set.headers["Content-Type"] = file.type;
    set.headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(file.name)}"`;
    set.headers["Content-Length"] = String(file.size);
    return file.data;
  })
  // WebSocket para sincronización en tiempo real de notas y eventos
  .ws("/ws", {
    open(ws) {
      try {
        const rawUrl = ws.data?.elysia?.request?.url || "";
        if (rawUrl) {
          const url = new URL(rawUrl);
          const roomCode = url.searchParams.get("room")?.trim().toUpperCase();
          if (roomCode) {
            const role = (url.searchParams.get("role") as any) || "client";
            const deviceType = (url.searchParams.get("deviceType") as any) || "web";
            const deviceId = url.searchParams.get("deviceId") || crypto.randomUUID();

            ws.subscribe(roomCode);
            (ws.data as any).room = roomCode;
            (ws.data as any).deviceId = deviceId;

            const room = getOrCreateRoom(roomCode);
            room.devices.set(deviceId, {
              id: deviceId,
              role,
              deviceType,
              connectedAt: Date.now(),
            });

            ws.send(JSON.stringify({
              type: "joined",
              room: roomCode,
              role,
              deviceId,
              deviceCount: room.devices.size,
            }));

            ws.publish(roomCode, JSON.stringify({
              type: "peer-joined",
              role,
              deviceType,
              deviceId,
              deviceCount: room.devices.size,
            }));
          }
        }
      } catch (err) {
        console.error("Error en WebSocket open:", err);
      }
    },
    message(ws, raw) {
      let data: any;
      try {
        data = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return;
      }

      if (!data || !data.type) return;

      // Ping / Pong para mantener activa la conexión
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        return;
      }

      // Unirse a una sala explícitamente por mensaje
      if (data.type === "join") {
        const roomCode = String(data.room || "").trim().toUpperCase();
        if (!roomCode) return;

        const role = data.role === "host" ? "host" : "client";
        const deviceType = data.deviceType || "web";
        const deviceId = data.deviceId || (ws.data as any).deviceId || crypto.randomUUID();

        // Si ya estaba en otra sala, desuscribir
        const currentRoom = (ws.data as any).room;
        if (currentRoom && currentRoom !== roomCode) {
          ws.unsubscribe(currentRoom);
          const oldRoom = rooms.get(currentRoom);
          if (oldRoom) {
            oldRoom.devices.delete((ws.data as any).deviceId);
            ws.publish(currentRoom, JSON.stringify({
              type: "peer-left",
              deviceId: (ws.data as any).deviceId,
              deviceCount: oldRoom.devices.size,
            }));
          }
        }

        ws.subscribe(roomCode);
        (ws.data as any).room = roomCode;
        (ws.data as any).deviceId = deviceId;

        const room = getOrCreateRoom(roomCode);
        room.devices.set(deviceId, {
          id: deviceId,
          role,
          deviceType,
          connectedAt: Date.now(),
        });

        ws.send(JSON.stringify({
          type: "joined",
          room: roomCode,
          role,
          deviceId,
          deviceCount: room.devices.size,
        }));

        ws.publish(roomCode, JSON.stringify({
          type: "peer-joined",
          role,
          deviceType,
          deviceId,
          deviceCount: room.devices.size,
        }));
        return;
      }

      // Reenviar todos los eventos de sincronización a los demás clientes en la sala
      const roomCode = (ws.data as any).room || data.room;
      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          room.lastActive = Date.now();
        }
        // Publicar a todos los demás clientes suscritos a la sala
        ws.publish(roomCode, JSON.stringify(data));
      }
    },
    close(ws) {
      const roomCode = (ws.data as any).room;
      const deviceId = (ws.data as any).deviceId;

      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room && deviceId) {
          room.devices.delete(deviceId);
          ws.publish(roomCode, JSON.stringify({
            type: "peer-left",
            deviceId,
            deviceCount: room.devices.size,
          }));
        }
        ws.unsubscribe(roomCode);
      }
    },
  })
  .listen(port);

console.log(`🚀 Anotapp Sync Server ejecutándose en http://localhost:${port}`);
