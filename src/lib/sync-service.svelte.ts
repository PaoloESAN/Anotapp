export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type P2PStatus = "disconnected" | "connecting" | "connected";

export interface SyncPeerInfo {
    id: string;
    role: "host" | "client";
    deviceType: "desktop" | "mobile" | "web";
}

interface IncomingFileTransfer {
    fileId: string;
    name: string;
    size: number;
    mimeType: string;
    totalChunks: number;
    chunks: ArrayBuffer[];
    receivedChunks: number;
    receivedBytes: number;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

class SyncService {
    status = $state<ConnectionStatus>("disconnected");
    p2pStatus = $state<P2PStatus>("disconnected");
    roomCode = $state<string>("");
    isHost = $state<boolean>(false);
    deviceCount = $state<number>(0);
    connectedPeers = $state<SyncPeerInfo[]>([]);
    transferProgress = $state<{ fileId: string; percent: number; name: string } | null>(null);

    deviceId = "";
    deviceType: "desktop" | "mobile" | "web" = "web";

    private ws: WebSocket | null = null;
    private pc: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;

    private reconnectTimer: any = null;
    private pingTimer: any = null;
    private reconnectAttempts = 0;
    private messageListeners = new Set<(data: any) => void>();
    private stateSyncProvider: (() => any) | null = null;

    // Incoming file assembly map
    private incomingTransfers = new Map<string, IncomingFileTransfer>();

    constructor() {
        if (typeof window !== "undefined") {
            let savedId = sessionStorage.getItem("anotapp_device_id");
            if (!savedId) {
                savedId = crypto.randomUUID();
                sessionStorage.setItem("anotapp_device_id", savedId);
            }
            this.deviceId = savedId;

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
        return "https://anotapp-production.up.railway.app";
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
        this.closePeerConnection();
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

                socket.send(JSON.stringify({
                    type: "join",
                    room,
                    role: asHost ? "host" : "client",
                    deviceType: this.deviceType,
                    deviceId: this.deviceId,
                }));

                // Iniciar WebRTC si somos Host
                if (this.isHost) {
                    this.initHostWebRTC();
                }

                // Ping heartbeat
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
                this.closePeerConnection();
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

    // ==========================================
    // WebRTC P2P ENGINE (Direct DataChannel)
    // ==========================================
    private getRtcConfig(): RTCConfiguration {
        return {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" },
            ],
        };
    }

    private initHostWebRTC() {
        if (typeof window === "undefined" || !window.RTCPeerConnection) return;
        this.closePeerConnection();
        this.p2pStatus = "connecting";

        try {
            const pc = new RTCPeerConnection(this.getRtcConfig());
            this.pc = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.broadcast({
                        type: "webrtc-ice",
                        candidate: event.candidate,
                        from: this.deviceId,
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === "connected") {
                    this.p2pStatus = "connected";
                } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                    this.p2pStatus = "disconnected";
                }
            };

            const dc = pc.createDataChannel("anotapp-p2p", { ordered: true });
            this.setupDataChannel(dc);
        } catch (err) {
            console.warn("WebRTC host setup failed, using WebSocket relay fallback:", err);
            this.p2pStatus = "disconnected";
        }
    }

    private setupDataChannel(dc: RTCDataChannel) {
        this.dataChannel = dc;
        dc.binaryType = "arraybuffer";

        dc.onopen = () => {
            this.p2pStatus = "connected";
        };

        dc.onclose = () => {
            this.p2pStatus = "disconnected";
            this.dataChannel = null;
        };

        dc.onmessage = (event) => {
            if (typeof event.data === "string") {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch {
                    console.error("Error parseando dataChannel string:", event.data);
                }
            } else if (event.data instanceof ArrayBuffer) {
                this.handleBinaryData(event.data);
            }
        };
    }

    private async handleWebRtcOffer(offer: RTCSessionDescriptionInit, from: string) {
        if (this.isHost || typeof window === "undefined" || !window.RTCPeerConnection) return;
        this.closePeerConnection();
        this.p2pStatus = "connecting";

        try {
            const pc = new RTCPeerConnection(this.getRtcConfig());
            this.pc = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.broadcast({
                        type: "webrtc-ice",
                        candidate: event.candidate,
                        from: this.deviceId,
                    });
                }
            };

            pc.ondatachannel = (event) => {
                this.setupDataChannel(event.channel);
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === "connected") {
                    this.p2pStatus = "connected";
                } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                    this.p2pStatus = "disconnected";
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.broadcast({
                type: "webrtc-answer",
                answer,
                from: this.deviceId,
            });
        } catch (err) {
            console.warn("Error handling WebRTC offer:", err);
            this.p2pStatus = "disconnected";
        }
    }

    private async handleWebRtcAnswer(answer: RTCSessionDescriptionInit) {
        if (!this.pc) return;
        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.warn("Error handling WebRTC answer:", err);
        }
    }

    private async handleWebRtcIce(candidate: RTCIceCandidateInit) {
        if (!this.pc) return;
        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.warn("Error adding ICE candidate:", err);
        }
    }

    private closePeerConnection() {
        if (this.dataChannel) {
            try { this.dataChannel.close(); } catch {}
            this.dataChannel = null;
        }
        if (this.pc) {
            try { this.pc.close(); } catch {}
            this.pc = null;
        }
        this.p2pStatus = "disconnected";
    }

    // ==========================================
    // INCOMING MESSAGES & STREAMING RELAY
    // ==========================================
    private handleMessage(data: any) {
        if (!data || !data.type) return;

        // Ignore messages sent by self
        if (data.from && data.from === this.deviceId) return;

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

            // Si somos Host, creamos la oferta WebRTC para el nuevo peer
            if (this.isHost && this.pc) {
                this.pc.createOffer().then((offer) => {
                    this.pc?.setLocalDescription(offer);
                    this.broadcast({
                        type: "webrtc-offer",
                        offer,
                        from: this.deviceId,
                    });
                }).catch((e) => console.warn("Error creating WebRTC offer:", e));

                // Sincronizar estado completo
                if (this.stateSyncProvider) {
                    const currentState = this.stateSyncProvider();
                    if (currentState) {
                        this.broadcast({
                            type: "sync-state",
                            ...currentState,
                        });
                    }
                }
            }
            return;
        }

        if (data.type === "peer-left") {
            if (typeof data.deviceCount === "number") {
                this.deviceCount = data.deviceCount;
            }
            return;
        }

        // WebRTC Signaling
        if (data.type === "webrtc-offer" && data.offer) {
            this.handleWebRtcOffer(data.offer, data.from);
            return;
        }

        if (data.type === "webrtc-answer" && data.answer) {
            this.handleWebRtcAnswer(data.answer);
            return;
        }

        if (data.type === "webrtc-ice" && data.candidate) {
            this.handleWebRtcIce(data.candidate);
            return;
        }

        // Binary File Streaming over WebSocket (Fallback or Direct)
        if (data.type === "stream-file-start") {
            this.incomingTransfers.set(data.fileId, {
                fileId: data.fileId,
                name: data.name,
                size: data.size,
                mimeType: data.mimeType || "application/octet-stream",
                totalChunks: data.totalChunks,
                chunks: new Array(data.totalChunks),
                receivedChunks: 0,
                receivedBytes: 0,
            });
            this.transferProgress = { fileId: data.fileId, percent: 0, name: data.name };
            return;
        }

        if (data.type === "stream-file-chunk") {
            const transfer = this.incomingTransfers.get(data.fileId);
            if (transfer) {
                const chunkBuffer = base64ToArrayBuffer(data.data);
                transfer.chunks[data.chunkIndex] = chunkBuffer;
                transfer.receivedChunks++;
                transfer.receivedBytes += chunkBuffer.byteLength;

                const percent = Math.round((transfer.receivedChunks / transfer.totalChunks) * 100);
                this.transferProgress = { fileId: data.fileId, percent, name: transfer.name };
            }
            return;
        }

        if (data.type === "stream-file-end") {
            const transfer = this.incomingTransfers.get(data.fileId);
            if (transfer) {
                const blob = new Blob(transfer.chunks, { type: transfer.mimeType });
                const blobUrl = URL.createObjectURL(blob);
                this.incomingTransfers.delete(data.fileId);
                this.transferProgress = null;

                // Notificar que el archivo completó su transferencia
                this.notifyFileReady(transfer.fileId, transfer.name, blobUrl, transfer.size, transfer.mimeType);
            }
            return;
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

    private handleBinaryData(buffer: ArrayBuffer) {
        // En WebRTC DataChannel enviamos metadatos como JSON string y trozos como ArrayBuffer con un encabezado
        // Header: [4 bytes chunkIndex, 36 bytes fileId string] + payload
        try {
            const view = new DataView(buffer);
            const chunkIndex = view.getUint32(0);
            const decoder = new TextDecoder();
            const fileId = decoder.decode(new Uint8Array(buffer, 4, 36));
            const chunkPayload = buffer.slice(40);

            const transfer = this.incomingTransfers.get(fileId);
            if (transfer) {
                transfer.chunks[chunkIndex] = chunkPayload;
                transfer.receivedChunks++;
                transfer.receivedBytes += chunkPayload.byteLength;

                const percent = Math.round((transfer.receivedChunks / transfer.totalChunks) * 100);
                this.transferProgress = { fileId, percent, name: transfer.name };

                if (transfer.receivedChunks >= transfer.totalChunks) {
                    const blob = new Blob(transfer.chunks, { type: transfer.mimeType });
                    const blobUrl = URL.createObjectURL(blob);
                    this.incomingTransfers.delete(fileId);
                    this.transferProgress = null;

                    this.notifyFileReady(fileId, transfer.name, blobUrl, transfer.size, transfer.mimeType);
                }
            }
        } catch (e) {
            console.error("Error procesando paquete binario WebRTC:", e);
        }
    }

    private notifyFileReady(fileId: string, name: string, blobUrl: string, size: number, mimeType: string) {
        const isImage = mimeType.startsWith("image/");
        const eventData = {
            type: "file-transfer-ready",
            fileId,
            name,
            size,
            mimeType,
            downloadUrl: blobUrl,
            isImage,
        };

        for (const listener of this.messageListeners) {
            try {
                listener(eventData);
            } catch (err) {
                console.error("Error en file-transfer-ready listener:", err);
            }
        }
    }

    broadcast(message: any) {
        const payload = JSON.stringify(message);

        // Si P2P DataChannel está abierto y no es señalización WebRTC, enviamos por P2P directo!
        if (
            this.dataChannel &&
            this.dataChannel.readyState === "open" &&
            !message.type.startsWith("webrtc-")
        ) {
            try {
                this.dataChannel.send(payload);
                return;
            } catch (err) {
                console.warn("Fallo al enviar por DataChannel, usando WebSocket:", err);
            }
        }

        // De lo contrario enviamos por el WebSocket de Elysia
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(payload);
            } catch (err) {
                console.error("Error enviando mensaje WS:", err);
            }
        }
    }

    // ==========================================
    // P2P / STREAM FILE TRANSFER (ZERO RAM/STORAGE)
    // ==========================================
    async transferFile(
        file: File,
        onProgress?: (percent: number) => void
    ): Promise<{
        fileId: string;
        name: string;
        size: number;
        type: string;
        downloadUrl: string;
    }> {
        const fileId = crypto.randomUUID();
        const localBlobUrl = URL.createObjectURL(file);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const useP2P = this.dataChannel && this.dataChannel.readyState === "open";

        // 1. Iniciar transferencia informando metadatos
        const startMsg = {
            type: "stream-file-start",
            fileId,
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            totalChunks,
            isP2P: useP2P,
            from: this.deviceId,
        };

        if (useP2P && this.dataChannel) {
            this.dataChannel.send(JSON.stringify(startMsg));
        } else {
            this.broadcast(startMsg);
        }

        // 2. Transmitir en trozos de 64 KB
        let offset = 0;
        let chunkIndex = 0;

        while (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const arrayBuffer = await slice.arrayBuffer();

            if (useP2P && this.dataChannel) {
                // Flow control para WebRTC DataChannel (esperar si buffer lleno)
                while (this.dataChannel.bufferedAmount > 1024 * 1024) {
                    await new Promise((r) => setTimeout(r, 20));
                }

                // Header binario: [4 bytes uint32 index, 36 bytes fileId string] + payload
                const packet = new Uint8Array(40 + arrayBuffer.byteLength);
                const view = new DataView(packet.buffer);
                view.setUint32(0, chunkIndex);
                const encoder = new TextEncoder();
                packet.set(encoder.encode(fileId.padEnd(36, " ")), 4);
                packet.set(new Uint8Array(arrayBuffer), 40);

                this.dataChannel.send(packet.buffer);
            } else {
                // Transmisión directa por WebSocket en trozos Base64 sin guardar en servidor
                const base64Chunk = arrayBufferToBase64(arrayBuffer);
                this.broadcast({
                    type: "stream-file-chunk",
                    fileId,
                    chunkIndex,
                    data: base64Chunk,
                    from: this.deviceId,
                });
                // Pausa mínima para no saturar el socket en archivos muy grandes
                if (chunkIndex % 8 === 0) {
                    await new Promise((r) => setTimeout(r, 5));
                }
            }

            offset += arrayBuffer.byteLength;
            chunkIndex++;

            const percent = Math.round((chunkIndex / totalChunks) * 100);
            if (onProgress) onProgress(percent);
            this.transferProgress = { fileId, percent, name: file.name };
        }

        // 3. Finalizar transferencia
        const endMsg = {
            type: "stream-file-end",
            fileId,
            from: this.deviceId,
        };

        if (useP2P && this.dataChannel) {
            this.dataChannel.send(JSON.stringify(endMsg));
        } else {
            this.broadcast(endMsg);
        }

        this.transferProgress = null;

        return {
            fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            downloadUrl: localBlobUrl,
        };
    }

    disconnect() {
        this.roomCode = "";
        this.isHost = false;
        this.deviceCount = 0;
        this.clearTimers();
        this.closePeerConnection();
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
