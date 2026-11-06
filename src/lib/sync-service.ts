export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface SyncPeerInfo {
    id: string;
    role: "host" | "client";
    deviceType: "desktop" | "mobile" | "web";
}

class SyncService {
    status = $state<ConnectionStatus>("disconnected");
    roomCode = $state<string>("");
    isHost = $state<boolean>(false);
    deviceCount = $state<number>(0);
    connectedPeers = $state<SyncPeerInfo[]>([]);
    deviceId = "";
    deviceType: "desktop" | "mobile" | "web" = "web";

    private ws: WebSocket | null = null;
    private reconnectTimer: any = null;
    private pingTimer: any = null;
    private reconnectAttempts = 0;
    private messageListeners = new Set<(data: any) => void>();
    private stateSyncProvider: (() => any) | null = null;

    constructor() {
        if (typeof window !== "undefined") {
            // Generar o recuperar deviceId
            let savedId = sessionStorage.getItem("anotapp_device_id");
            if (!savedId) {
                savedId = crypto.randomUUID();
                sessionStorage.setItem("anotapp_device_id", savedId);
            }
            this.deviceId = savedId;

            // Detectar tipo de dispositivo
            if ((window as any).__TAURI_INTERNALS__) {
                this.deviceType = "desktop";
            } else if (
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                    navigator.userAgent
                ) || window.innerWidth < 768
            ) {
                this.deviceType = "mobile";
            } else {
                this.deviceType = "web";
            }

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible" && this.roomCode && this.status === "disconnected") {
                    this.connect(this.roomCode, this.isHost);
                }
            });
        }
    }

    getServerUrl(): string {
        const envUrl = (import.meta.env.PUBLIC_SERVER_URL as string) || "";
        if (envUrl && envUrl.trim() !== "") {
            return envUrl.replace(/\/+$/, "");
        }
        if (typeof window !== "undefined") {
            if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
                return "http://localhost:3000";
            }
        }
        return "http://localhost:3000";
    }

    getWsUrl(): string {
        const httpUrl = this.getServerUrl();
        if (httpUrl.startsWith("https://")) {
            return httpUrl.replace("https://", "wss://") + "/ws";
        }
        return httpUrl.replace("http://", "ws://") + "/ws";
    }

    onMessage(callback: (data: any) => void) {
        this.messageListeners.add(callback);
        return () => this.messageListeners.delete(callback);
    }

    setStateSyncProvider(provider: () => any) {
        this.stateSyncProvider = provider;
    }

    async createOrJoinHost(preferredCode?: string): Promise<string> {
        this.isHost = true;
        try {
            const serverUrl = this.getServerUrl();
            const res = await fetch(`${serverUrl}/api/room`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: preferredCode }),
            });
            const data = await res.json();
            if (data.success && data.code) {
                this.roomCode = data.code;
                await this.connect(data.code, true);
                return data.code;
            }
        } catch (err) {
            console.warn("No se pudo conectar al endpoint HTTP de salas, usando fallback:", err);
        }

        // Fallback local code
        const fallbackCode = preferredCode || this.generateFallbackCode();
        this.roomCode = fallbackCode;
        await this.connect(fallbackCode, true);
        return fallbackCode;
    }

    async connectToRoom(code: string): Promise<void> {
        this.isHost = false;
        const upper = code.trim().toUpperCase();
        this.roomCode = upper;
        await this.connect(upper, false);
    }

    private async connect(room: string, asHost: boolean) {
        this.clearTimers();
        this.status = this.reconnectAttempts > 0 ? "reconnecting" : "connecting";

        try {
            if (this.ws) {
                try {
                    this.ws.close();
                } catch {}
                this.ws = null;
            }

            const wsBase = this.getWsUrl();
            const wsUrl = `${wsBase}?room=${encodeURIComponent(room)}&role=${asHost ? "host" : "client"}&deviceType=${this.deviceType}&deviceId=${this.deviceId}`;
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                this.ws = socket;
                this.status = "connected";
                this.reconnectAttempts = 0;

                // Enviar mensaje de join explícito para compatibilidad total
                socket.send(JSON.stringify({
                    type: "join",
                    room,
                    role: asHost ? "host" : "client",
                    deviceType: this.deviceType,
                    deviceId: this.deviceId,
                }));

                // Iniciar ping heartbeat cada 20s
                this.pingTimer = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ type: "ping" }));
                    }
                }, 20000);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error("Error parseando mensaje WS:", e);
                }
            };

            socket.onclose = () => {
                this.ws = null;
                this.clearTimers();
                if (this.roomCode) {
                    this.status = "reconnecting";
                    this.scheduleReconnect();
                } else {
                    this.status = "disconnected";
                }
            };

            socket.onerror = (err) => {
                console.warn("WebSocket error:", err);
            };
        } catch (err) {
            console.error("Error al iniciar WebSocket:", err);
            this.status = "reconnecting";
            this.scheduleReconnect();
        }
    }

    private handleMessage(data: any) {
        if (!data || !data.type) return;

        if (data.type === "pong") return;

        if (data.type === "joined") {
            if (typeof data.deviceCount === "number") {
                this.deviceCount = data.deviceCount;
            }
            return;
        }

        if (data.type === "peer-joined") {
            if (typeof data.deviceCount === "number") {
                this.deviceCount = data.deviceCount;
            }
            // Si somos host y entra un nuevo peer, enviamos el estado actual sincronizado
            if (this.isHost && this.stateSyncProvider) {
                const currentState = this.stateSyncProvider();
                if (currentState) {
                    this.broadcast({
                        type: "sync-state",
                        ...currentState,
                    });
                }
            }
        }

        if (data.type === "peer-left") {
            if (typeof data.deviceCount === "number") {
                this.deviceCount = data.deviceCount;
            }
        }

        // Notificar a todos los listeners registrados
        for (const listener of this.messageListeners) {
            try {
                listener(data);
            } catch (err) {
                console.error("Error en listener de sincronización:", err);
            }
        }
    }

    broadcast(message: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (err) {
                console.error("Error enviando mensaje WS:", err);
            }
        }
    }

    async uploadFile(file: File): Promise<{
        success: boolean;
        fileId?: string;
        name?: string;
        type?: string;
        size?: number;
        downloadUrl?: string;
        error?: string;
    }> {
        try {
            const serverUrl = this.getServerUrl();
            const formData = new FormData();
            formData.append("file", file, file.name);

            const res = await fetch(`${serverUrl}/api/upload`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (data.success) {
                const fullDownloadUrl = data.downloadUrl.startsWith("http")
                    ? data.downloadUrl
                    : `${serverUrl}${data.downloadUrl}`;

                return {
                    success: true,
                    fileId: data.fileId,
                    name: data.name,
                    type: data.type,
                    size: data.size,
                    downloadUrl: fullDownloadUrl,
                };
            }
            return { success: false, error: data.error || "Fallo en la subida" };
        } catch (err: any) {
            console.error("Error al subir archivo a Elysia server:", err);
            return { success: false, error: err.message };
        }
    }

    disconnect() {
        this.roomCode = "";
        this.isHost = false;
        this.deviceCount = 0;
        this.clearTimers();
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
        }
        this.status = "disconnected";
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.roomCode) {
                this.connect(this.roomCode, this.isHost);
            }
        }, delay);
    }

    private clearTimers() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private generateFallbackCode(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let res = "";
        for (let i = 0; i < 6; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return res;
    }
}

export const syncService = new SyncService();
