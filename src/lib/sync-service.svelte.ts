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

const CHUNK_SIZE = 16 * 1024; // 16 KB (tamaño seguro para WebRTC DataChannel y WebSocket sin truncamiento)

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    const step = 8192;
    for (let i = 0; i < len; i += step) {
        const sub = bytes.subarray(i, Math.min(i + step, len));
        binary += String.fromCharCode.apply(null, Array.from(sub));
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
    private pendingIceCandidates: RTCIceCandidateInit[] = [];

    private reconnectTimer: any = null;
    private pingTimer: any = null;
    private reconnectAttempts = 0;
    private messageListeners = new Set<(data: any) => void>();
    private stateSyncProvider: (() => any) | null = null;
    private isConnectingPromise: Promise<string> | null = null;

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
                if (
                    document.visibilityState === "visible" &&
                    this.roomCode &&
                    this.status === "disconnected"
                ) {
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
        // Evitar reconexiones duplicadas si ya estamos conectados o conectando como host
        if (
            this.isHost &&
            this.roomCode &&
            (this.status === "connected" || this.status === "connecting")
        ) {
            return this.roomCode;
        }
        if (this.isConnectingPromise) {
            return this.isConnectingPromise;
        }

        this.isHost = true;
        this.isConnectingPromise = (async () => {
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
        })();

        try {
            return await this.isConnectingPromise;
        } finally {
            this.isConnectingPromise = null;
        }
    }

    async connectToRoom(code: string): Promise<void> {
        const upper = code.trim().toUpperCase();
        if (!upper) return;

        // Si ya estamos conectados a esta misma sala como cliente, no reiniciar socket
        if (
            !this.isHost &&
            this.roomCode === upper &&
            (this.status === "connected" || this.status === "connecting")
        ) {
            return;
        }

        this.isHost = false;
        this.roomCode = upper;
        await this.connect(upper, false);
    }

    private async connect(room: string, asHost: boolean) {
        this.clearTimers();
        this.closePeerConnection();
        this.status = this.reconnectAttempts > 0 ? "reconnecting" : "connecting";

        try {
            // Desacoplar handlers del socket anterior ANTES de cerrarlo para evitar que su onclose dispare reconexión en bucle
            if (this.ws) {
                const oldWs = this.ws;
                this.ws = null;
                oldWs.onopen = null;
                oldWs.onmessage = null;
                oldWs.onclose = null;
                oldWs.onerror = null;
                try {
                    oldWs.close();
                } catch {}
            }

            const wsBase = this.getWsUrl();
            const wsUrl = `${wsBase}?room=${encodeURIComponent(room)}&role=${asHost ? "host" : "client"}&deviceType=${this.deviceType}&deviceId=${this.deviceId}`;
            const socket = new WebSocket(wsUrl);
            this.ws = socket;

            socket.onopen = () => {
                if (this.ws !== socket) return;
                this.status = "connected";
                this.reconnectAttempts = 0;

                // Nota: la suscripción inicial ya se hace mediante los query params en server open(ws),
                // evitamos enviar un segundo "join" redundante que causaba doble evento peer-joined.

                // Ping heartbeat cada 20s
                this.pingTimer = setInterval(() => {
                    if (this.ws === socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: "ping" }));
                    }
                }, 20000);
            };

            socket.onmessage = (event) => {
                if (this.ws !== socket) return;
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error("Error parseando mensaje WS:", e);
                }
            };

            socket.onclose = () => {
                if (this.ws !== socket) return;
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
                if (this.ws !== socket) return;
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

    private createHostPeerConnection() {
        if (typeof window === "undefined" || !window.RTCPeerConnection) return null;
        this.closePeerConnection();
        this.p2pStatus = "connecting";

        try {
            const pc = new RTCPeerConnection(this.getRtcConfig());
            this.pc = pc;
            this.pendingIceCandidates = [];

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendViaWs({
                        type: "webrtc-ice",
                        candidate: event.candidate,
                        from: this.deviceId,
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === "connected") {
                    this.p2pStatus = "connected";
                } else if (
                    pc.connectionState === "disconnected" ||
                    pc.connectionState === "failed" ||
                    pc.connectionState === "closed"
                ) {
                    this.p2pStatus = "disconnected";
                }
            };

            const dc = pc.createDataChannel("anotapp-p2p", { ordered: true });
            this.setupDataChannel(dc);
            return pc;
        } catch (err) {
            console.warn("WebRTC host setup failed, using WebSocket relay fallback:", err);
            this.p2pStatus = "disconnected";
            return null;
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
            if (this.dataChannel === dc) {
                this.dataChannel = null;
            }
        };

        dc.onmessage = async (event) => {
            if (typeof event.data === "string") {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch {
                    console.error("Error parseando dataChannel string:", event.data);
                }
            } else if (event.data instanceof ArrayBuffer) {
                this.handleBinaryData(event.data);
            } else if (event.data instanceof Blob) {
                const buf = await event.data.arrayBuffer();
                this.handleBinaryData(buf);
            }
        };
    }

    private async handleWebRtcOffer(offer: RTCSessionDescriptionInit, _from: string) {
        if (this.isHost || typeof window === "undefined" || !window.RTCPeerConnection) return;
        this.closePeerConnection();
        this.p2pStatus = "connecting";

        try {
            const pc = new RTCPeerConnection(this.getRtcConfig());
            this.pc = pc;
            this.pendingIceCandidates = [];

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendViaWs({
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
                } else if (
                    pc.connectionState === "disconnected" ||
                    pc.connectionState === "failed" ||
                    pc.connectionState === "closed"
                ) {
                    this.p2pStatus = "disconnected";
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Drenar candidatos ICE recibidos antes de tener remoteDescription
            for (const cand of this.pendingIceCandidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
            }
            this.pendingIceCandidates = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendViaWs({
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
            if (this.pc.signalingState === "have-local-offer") {
                await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
                for (const cand of this.pendingIceCandidates) {
                    try {
                        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                    } catch {}
                }
                this.pendingIceCandidates = [];
            }
        } catch (err) {
            console.warn("Error handling WebRTC answer:", err);
        }
    }

    private async handleWebRtcIce(candidate: RTCIceCandidateInit) {
        if (!this.pc) return;
        try {
            if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
                await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                this.pendingIceCandidates.push(candidate);
            }
        } catch (err) {
            console.warn("Error adding ICE candidate:", err);
        }
    }

    private closePeerConnection() {
        this.pendingIceCandidates = [];
        if (this.dataChannel) {
            try {
                this.dataChannel.onopen = null;
                this.dataChannel.onclose = null;
                this.dataChannel.onmessage = null;
                this.dataChannel.close();
            } catch {}
            this.dataChannel = null;
        }
        if (this.pc) {
            try {
                this.pc.onicecandidate = null;
                this.pc.onconnectionstatechange = null;
                this.pc.ondatachannel = null;
                this.pc.close();
            } catch {}
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
        if (data.deviceId && data.deviceId === this.deviceId && data.type === "peer-joined") return;

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

            // Si somos Host, creamos una nueva conexión WebRTC limpia y enviamos la oferta al peer
            if (this.isHost) {
                const pc = this.createHostPeerConnection();
                if (pc) {
                    pc.createOffer()
                        .then(async (offer) => {
                            await pc.setLocalDescription(offer);
                            this.sendViaWs({
                                type: "webrtc-offer",
                                offer,
                                from: this.deviceId,
                            });
                        })
                        .catch((e) => console.warn("Error creating WebRTC offer:", e));
                }

                // Sincronizar estado completo por WebSocket
                if (this.stateSyncProvider) {
                    const currentState = this.stateSyncProvider();
                    if (currentState) {
                        this.sendViaWs({
                            type: "sync-state",
                            ...currentState,
                            from: this.deviceId,
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
            if (this.deviceCount <= 1) {
                this.closePeerConnection();
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

        // Binary File Streaming over WebSocket or DataChannel
        if (data.type === "stream-file-start") {
            const totalChunks = Math.max(1, Number(data.totalChunks) || 1);
            this.incomingTransfers.set(data.fileId, {
                fileId: data.fileId,
                name: data.name || "archivo",
                size: Number(data.size) || 0,
                mimeType: data.mimeType || "application/octet-stream",
                totalChunks,
                chunks: new Array(totalChunks),
                receivedChunks: 0,
                receivedBytes: 0,
            });
            this.transferProgress = { fileId: data.fileId, percent: 0, name: data.name || "archivo" };
            return;
        }

        if (data.type === "stream-file-chunk") {
            const transfer = this.incomingTransfers.get(data.fileId);
            if (transfer && typeof data.chunkIndex === "number" && data.data) {
                if (!transfer.chunks[data.chunkIndex]) {
                    const chunkBuffer = base64ToArrayBuffer(data.data);
                    transfer.chunks[data.chunkIndex] = chunkBuffer;
                    transfer.receivedChunks++;
                    transfer.receivedBytes += chunkBuffer.byteLength;

                    const percent = Math.min(99, Math.round((transfer.receivedChunks / transfer.totalChunks) * 100));
                    this.transferProgress = { fileId: data.fileId, percent, name: transfer.name };

                    if (transfer.receivedChunks >= transfer.totalChunks) {
                        this.finalizeIncomingTransfer(data.fileId, ( data as any ).isOnDemand);
                    }
                }
            }
            return;
        }

        if (data.type === "stream-file-end") {
            const transfer = this.incomingTransfers.get(data.fileId);
            if (transfer && transfer.receivedChunks >= transfer.totalChunks) {
                this.finalizeIncomingTransfer(data.fileId, data.isOnDemand);
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

    private finalizeIncomingTransfer(fileId: string, isOnDemand = false) {
        const transfer = this.incomingTransfers.get(fileId);
        if (!transfer) return;

        // Filtrar posibles huecos por seguridad
        const validChunks = transfer.chunks.filter(Boolean);
        const blob = new Blob(validChunks, { type: transfer.mimeType });
        const blobUrl = URL.createObjectURL(blob);
        this.incomingTransfers.delete(fileId);
        this.transferProgress = null;

        this.notifyFileReady(
            fileId,
            transfer.name,
            blobUrl,
            blob,
            transfer.size,
            transfer.mimeType,
            isOnDemand
        );
    }

    private handleBinaryData(buffer: ArrayBuffer) {
        // Header: [4 bytes chunkIndex, 36 bytes fileId string] + payload
        try {
            if (buffer.byteLength < 40) return;
            const view = new DataView(buffer);
            const chunkIndex = view.getUint32(0);
            const decoder = new TextDecoder();
            const fileId = decoder.decode(new Uint8Array(buffer, 4, 36)).trim();
            const chunkPayload = buffer.slice(40);

            const transfer = this.incomingTransfers.get(fileId);
            if (transfer && !transfer.chunks[chunkIndex]) {
                transfer.chunks[chunkIndex] = chunkPayload;
                transfer.receivedChunks++;
                transfer.receivedBytes += chunkPayload.byteLength;

                const percent = Math.min(99, Math.round((transfer.receivedChunks / transfer.totalChunks) * 100));
                this.transferProgress = { fileId, percent, name: transfer.name };

                if (transfer.receivedChunks >= transfer.totalChunks) {
                    this.finalizeIncomingTransfer(fileId, false);
                }
            }
        } catch (e) {
            console.error("Error procesando paquete binario WebRTC:", e);
        }
    }

    private notifyFileReady(
        fileId: string,
        name: string,
        blobUrl: string,
        blob: Blob,
        size: number,
        mimeType: string,
        isOnDemand = false
    ) {
        const isImage = mimeType.startsWith("image/");
        const eventData = {
            type: "file-transfer-ready",
            fileId,
            name,
            size,
            mimeType,
            downloadUrl: blobUrl,
            blob,
            isImage,
            isOnDemand,
        };

        for (const listener of this.messageListeners) {
            try {
                listener(eventData);
            } catch (err) {
                console.error("Error en file-transfer-ready listener:", err);
            }
        }
    }

    private sendViaWs(message: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({ ...message, from: this.deviceId }));
            } catch (err) {
                console.error("Error enviando mensaje WS:", err);
            }
        }
    }

    broadcast(message: any) {
        const msgWithFrom = { ...message, from: this.deviceId };
        const payload = JSON.stringify(msgWithFrom);

        // Si P2P DataChannel está abierto y no es señalización WebRTC, enviamos por P2P directo
        if (
            this.dataChannel &&
            this.dataChannel.readyState === "open" &&
            !message.type?.startsWith("webrtc-") &&
            payload.length < 64 * 1024
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
        onProgress?: (percent: number) => void,
        customFileId?: string,
        isOnDemand = false
    ): Promise<{
        fileId: string;
        name: string;
        size: number;
        type: string;
        downloadUrl: string;
    }> {
        const fileId = customFileId || crypto.randomUUID();
        const localBlobUrl = URL.createObjectURL(file);
        const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

        // 1. Iniciar transferencia informando metadatos por WebSocket y/o DataChannel para garantizar orden
        const startMsg = {
            type: "stream-file-start",
            fileId,
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            totalChunks,
            isOnDemand,
            from: this.deviceId,
        };

        this.broadcast(startMsg);

        // Pequeña espera para asegurar que el receptor haya inicializado el mapa incomingTransfers
        await new Promise((r) => setTimeout(r, 30));

        // 2. Transmitir en trozos seguros de 16 KB
        let offset = 0;
        let chunkIndex = 0;

        while (offset < file.size || (file.size === 0 && chunkIndex === 0)) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const arrayBuffer = await slice.arrayBuffer();

            // Enviamos chunks Base64 con control de flujo en el socket/datachannel para garantizar entrega íntegra al 100%
            const base64Chunk = arrayBufferToBase64(arrayBuffer);
            const chunkMsg = {
                type: "stream-file-chunk",
                fileId,
                chunkIndex,
                data: base64Chunk,
                isOnDemand,
                from: this.deviceId,
            };

            const useP2P = this.dataChannel && this.dataChannel.readyState === "open";
            if (useP2P && this.dataChannel) {
                while (this.dataChannel && this.dataChannel.readyState === "open" && this.dataChannel.bufferedAmount > 256 * 1024) {
                    await new Promise((r) => setTimeout(r, 15));
                }
                try {
                    this.dataChannel.send(JSON.stringify(chunkMsg));
                } catch {
                    this.sendViaWs(chunkMsg);
                }
            } else {
                if (this.ws) {
                    while (this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.bufferedAmount > 256 * 1024) {
                        await new Promise((r) => setTimeout(r, 15));
                    }
                }
                this.sendViaWs(chunkMsg);
            }

            offset += arrayBuffer.byteLength;
            chunkIndex++;

            const percent = Math.round((chunkIndex / totalChunks) * 100);
            if (onProgress) onProgress(percent);
            this.transferProgress = { fileId, percent, name: file.name };

            // Pausa de respiración cada 4 chunks (64 KB) para evitar desbordar el proxy WebSocket o DataChannel
            if (chunkIndex % 4 === 0) {
                await new Promise((r) => setTimeout(r, 10));
            }
            if (file.size === 0) break;
        }

        // 3. Finalizar transferencia
        const endMsg = {
            type: "stream-file-end",
            fileId,
            isOnDemand,
            from: this.deviceId,
        };
        this.broadcast(endMsg);

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
            const oldWs = this.ws;
            this.ws = null;
            oldWs.onopen = null;
            oldWs.onmessage = null;
            oldWs.onclose = null;
            oldWs.onerror = null;
            try {
                oldWs.close();
            } catch {}
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
