import { type ClipboardItem } from "$lib/types";
import { createWorker } from "tesseract.js";
import type { DataConnection } from "peerjs";
import { PUBLIC_FIREBASE_DB_URL } from "$env/static/public";

const FIREBASE_DB_URL = PUBLIC_FIREBASE_DB_URL;

export interface Workspace {
    id: string;
    name: string;
    items: ClipboardItem[];
}

class DesktopState {
    workspaces = $state<Workspace[]>([
        { id: "ws-default", name: "Mesa 1", items: [] }
    ]);
    activeWorkspaceId = $state("ws-default");

    get activeWorkspace() {
        return this.workspaces.find(ws => ws.id === this.activeWorkspaceId) || this.workspaces[0];
    }

    get items() {
        return this.activeWorkspace.items;
    }

    set items(newItems: ClipboardItem[]) {
        const ws = this.workspaces.find(ws => ws.id === this.activeWorkspaceId);
        if (ws) ws.items = newItems;
    }

    maxZ = $state(1);
    lastText = $state("");
    lastImageB64Len = $state(0);
    isReady = $state(false);
    clipboardPaused = $state(false);
    hideHeaders = $state(true);
    hideCardButtons = $state(false);
    bgPattern = $state("grid");
    customBgImage = $state("");
    isCtrlPressed = $state(false);

    contextMenu = $state<{
        open: boolean;
        x: number;
        y: number;
        item: any | null;
    }>({
        open: false,
        x: 0,
        y: 0,
        item: null,
    });

    peerId = $state("");
    peerInstance: any = null;

    draggedItemId = $state<string | null>(null);
    pointerY = $state(0);

    ocrText = $state("");
    ocrLoading = $state(false);
    ocrImageSrc = $state("");
    isOcrModalOpen = $state(false);
    isMobileLinkOpen = $state(false);

    hostConnection = $state<DataConnection | null>(null);
    connectedHostCode = $state("");
    clientConnections = $state<DataConnection[]>([]);

    hostedFiles = new Map<string, File>();
    requestedFiles = new Set<string>();

    constructor() {
        if (typeof localStorage !== "undefined") {
            try {
                const savedWS = localStorage.getItem("anotapp-workspaces");
                if (savedWS) {
                    this.workspaces = JSON.parse(savedWS);
                    // Calculate maxZ across all workspaces
                    let currentMaxZ = 1;
                    this.workspaces.forEach(ws => {
                        ws.items.forEach(item => {
                            if (item.z && item.z >= currentMaxZ) currentMaxZ = item.z + 1;
                        });
                    });
                    this.maxZ = currentMaxZ;
                }

                const savedActiveWS = localStorage.getItem("anotapp-active-ws");
                if (savedActiveWS && this.workspaces.find(ws => ws.id === savedActiveWS)) {
                    this.activeWorkspaceId = savedActiveWS;
                }

                const savedHeaders = localStorage.getItem("anotapp-hide-headers");
                if (savedHeaders !== null) this.hideHeaders = savedHeaders === "true";

                const savedCardButtons = localStorage.getItem("anotapp-hide-card-buttons");
                if (savedCardButtons !== null) this.hideCardButtons = savedCardButtons === "true";

                const savedBg = localStorage.getItem("anotapp-bg-pattern");
                if (savedBg) this.bgPattern = savedBg;

                const savedCustomBg = localStorage.getItem("anotapp-custom-bg-image");
                if (savedCustomBg) this.customBgImage = savedCustomBg;
            } catch (e) {
                console.error("Load error:", e);
            }
        }
    }

    initSerialization() {
        $effect(() => {
            const serializedWS = JSON.stringify(this.workspaces);
            const activeWS = this.activeWorkspaceId;
            const hideState = this.hideHeaders;
            const hideCardButtons = this.hideCardButtons;
            const bgState = this.bgPattern;
            const customBg = this.customBgImage;

            const timer = setTimeout(() => {
                try {
                    localStorage.setItem("anotapp-workspaces", serializedWS);
                    localStorage.setItem("anotapp-active-ws", activeWS);
                    localStorage.setItem("anotapp-hide-headers", String(hideState));
                    localStorage.setItem("anotapp-hide-card-buttons", String(hideCardButtons));
                    localStorage.setItem("anotapp-bg-pattern", bgState);
                    localStorage.setItem("anotapp-custom-bg-image", customBg);
                } catch (err) {
                    console.warn("Storage exception", err);
                }
            }, 500);

            return () => clearTimeout(timer);
        });

        $effect(() => {
            const activeWS = this.activeWorkspaceId;
            if (this.peerInstance && this.hostConnection === null) {
                // Sincronizar el estado de la nueva mesa con todos los clientes
                this.broadcastToClients({
                    type: "sync-state",
                    items: this.items
                });
            }
        });

        if (typeof window !== "undefined") {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Control' || e.key === 'Meta') this.isCtrlPressed = true;
            };
            const handleKeyUp = (e: KeyboardEvent) => {
                if (e.key === 'Control' || e.key === 'Meta') this.isCtrlPressed = false;
            };
            const handleBlur = () => {
                this.isCtrlPressed = false;
            };

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            window.addEventListener('blur', handleBlur);
        }
    }

    addWorkspace() {
        const id = crypto.randomUUID();
        const count = this.workspaces.length + 1;
        this.workspaces.push({
            id,
            name: `Mesa ${count}`,
            items: []
        });
        this.activeWorkspaceId = id;
    }

    removeWorkspace(id: string) {
        if (this.workspaces.length <= 1) return;
        const index = this.workspaces.findIndex(ws => ws.id === id);
        this.workspaces = this.workspaces.filter(ws => ws.id !== id);
        if (this.activeWorkspaceId === id) {
            this.activeWorkspaceId = this.workspaces[Math.max(0, index - 1)].id;
        }
    }

    addItem({
        type,
        content,
        files,
        w,
        h,
    }: {
        type: "text" | "image" | "files";
        content: string;
        files?: string[];
        w?: number;
        h?: number;
    }, fromPeer = false) {
        const newItem = {
            id: crypto.randomUUID(),
            type,
            content,
            files,
            x: window.innerWidth / 2 - 150 + (Math.random() * 100 - 50),
            y: window.innerHeight / 2 - 150 + (Math.random() * 100 - 50),
            z: this.maxZ++,
            w,
            h,
        };
        this.items = [...this.items, newItem];

        if (!fromPeer || this.hostConnection === null) {
            this.broadcastToClients({ type: "add-item", item: newItem });
        }
    }

    addEmptyText() {
        const newItem = {
            id: crypto.randomUUID(),
            type: "text" as const,
            content: "",
            x: window.innerWidth / 2 - 140 + (Math.random() * 40 - 20),
            y: window.innerHeight / 2 - 75 + (Math.random() * 40 - 20),
            z: this.maxZ++,
            w: 280,
            h: 150,
            editing: true,
        };
        this.items = [...this.items, newItem];
        this.broadcastToClients({ type: "add-item", item: newItem });
    }

    async handleImageUpdate(b64: string, fromPeer = false) {
        try {
            if (!b64 || b64.length === this.lastImageB64Len) return;
            this.lastImageB64Len = b64.length;

            const dataUrl = `data:image/png;base64,${b64}`;
            if (this.items.find((i) => i.type === "image" && i.content === dataUrl))
                return;

            const img = new Image();
            await new Promise<void>((res) => {
                img.onload = () => res();
                img.src = dataUrl;
            });
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;

            let targetW = iw + 16;
            let targetH = ih + 56;
            if (targetW > 350) {
                targetH = (350 / targetW) * targetH;
                targetW = 350;
            }
            if (targetH > 400) {
                targetW = (400 / targetH) * targetW;
                targetH = 400;
            }

            this.addItem({
                type: "image",
                content: dataUrl,
                w: targetW,
                h: targetH,
            }, fromPeer);
        } catch (err) { }
    }

    handleFilesUpdate(files: string[]) {
        if (!files || files.length === 0) return;
        const key = [...files].sort().join("|");
        if (this.items.find((i) => i.type === "files" && [...(i.files ?? [])].sort().join("|") === key))
            return;

        if (files.length === 1) {
            this.addItem({ type: "files", content: "", files, w: 200, h: 200 });
        } else {
            const cardW = Math.min(window.innerWidth - 48, 900);
            const cols = Math.max(1, Math.floor(cardW / 110));
            const rows = Math.ceil(files.length / cols);
            const cardH = Math.min(56 + rows * 110, window.innerHeight - 80);
            this.addItem({ type: "files", content: "", files, w: cardW, h: cardH });
        }
    }

    addPeerFile(fileId: string, name: string, size: number) {
        const newItem = {
            id: crypto.randomUUID(),
            type: "peer-file" as const,
            content: "",
            fileId,
            name,
            size,
            x: window.innerWidth / 2 - 100 + (Math.random() * 50 - 25),
            y: window.innerHeight / 2 - 50 + (Math.random() * 50 - 25),
            z: this.maxZ++,
            w: 240,
            h: 120,
        };
        this.items = [...this.items, newItem];
        this.broadcastToClients({ type: "add-item", item: newItem });
    }

    async triggerDownload(blob: Blob | File, defaultName: string) {
        if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
            try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const { writeFile } = await import("@tauri-apps/plugin-fs");
                const { downloadDir, join } = await import("@tauri-apps/api/path");
                
                const dDir = await downloadDir();
                const defaultPathToSave = await join(dDir, defaultName);
                
                const filePath = await save({
                    defaultPath: defaultPathToSave,
                    title: "Guardar archivo"
                });

                if (filePath) {
                    const arrayBuffer = await blob.arrayBuffer();
                    const u8array = new Uint8Array(arrayBuffer);
                    await writeFile(filePath, u8array);
                }
                return;
            } catch (err) {
                console.error("Falló la descarga nativa, usando fallback web:", err);
            }
        }

        // Fallback para Web / Móvil
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName || "descarga";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    requestFile(fileId: string) {
        this.requestedFiles.add(fileId);

        const file = this.hostedFiles.get(fileId);
        if (file) {
            this.triggerDownload(file, file.name);
            return;
        }

        this.broadcastToClients({ type: "request-file-data", fileId });
    }

    moveItemToWorkspace(itemId: string, targetWorkspaceId: string) {
        // Find current workspace and item
        let itemToMove: ClipboardItem | null = null;
        let sourceWsId = "";

        for (const ws of this.workspaces) {
            const index = ws.items.findIndex(i => i.id === itemId);
            if (index !== -1) {
                itemToMove = ws.items[index];
                sourceWsId = ws.id;
                // Don't move to the same workspace
                if (ws.id === targetWorkspaceId) return;

                // Remove from source
                ws.items = ws.items.filter(i => i.id !== itemId);
                break;
            }
        }

        if (itemToMove) {
            // Add to target workspace
            const targetWs = this.workspaces.find(ws => ws.id === targetWorkspaceId);
            if (targetWs) {
                // Position in the center of the window
                itemToMove.x = window.innerWidth / 2 - (itemToMove.w || 280) / 2;
                itemToMove.y = window.innerHeight / 2 - (itemToMove.h || 150) / 2;
                targetWs.items.push(itemToMove);
            }
        }
    }

    deleteItem(id: string, fromPeer = false) {
        this.items = this.items.filter((i) => i.id !== id);
        if (!fromPeer) {
            this.broadcastToClients({ type: "delete", id });
        }
    }

    updateItemBounds(id: string, x: number, y: number, w: number | undefined, h: number | undefined, z: number | undefined, fromPeer = false) {
        const item = this.items.find((i) => i.id === id);
        if (item) {
            if (x !== undefined) item.x = x;
            if (y !== undefined) item.y = y;
            if (w !== undefined) item.w = w;
            if (h !== undefined) item.h = h;
            if (z !== undefined) item.z = z;
        }
        if (!fromPeer) {
            this.broadcastToClients({ type: "update-bounds", id, x, y, w, h, z });
        }
    }

    updateItemContent(id: string, content: string, fromPeer = false) {
        const item = this.items.find((i) => i.id === id);
        if (item && item.type === "text") {
            item.content = content;
        }
        if (!fromPeer) {
            this.broadcastToClients({ type: "update-content", id, content });
        }
    }

    async registerPeerMapping(uuid: string): Promise<string> {
        const generateShortId = () => {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let result = "";
            for (let i = 0; i < 6; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        };

        for (let attempt = 0; attempt < 5; attempt++) {
            const shortId = generateShortId();
            try {
                const checkRes = await fetch(`${FIREBASE_DB_URL}/mappings/${shortId}.json`);
                const data = await checkRes.json();
                
                // Si no existe el mapeo, o está expirado (más de 2 horas)
                if (!data || !data.createdAt || Date.now() - data.createdAt > 7200000) {
                    await fetch(`${FIREBASE_DB_URL}/mappings/${shortId}.json`, {
                        method: "PUT",
                        body: JSON.stringify({
                            peerId: uuid,
                            createdAt: Date.now()
                        })
                    });
                    return shortId;
                }
            } catch (e) {
                console.error("Error al registrar en Firebase:", e);
            }
        }
        throw new Error("No se pudo generar un código único en Firebase.");
    }

    async connectToHost(shortCode: string) {
        if (!this.peerInstance) return;

        const code = shortCode.trim().toUpperCase();
        try {
            const res = await fetch(`${FIREBASE_DB_URL}/mappings/${code}.json`);
            const data = await res.json();
            if (!data || !data.peerId) {
                alert("Código de vinculación inválido o expirado.");
                return;
            }

            const hostUuid = data.peerId;
            const conn = this.peerInstance.connect(hostUuid);

            conn.on("open", () => {
                this.hostConnection = conn;
                this.connectedHostCode = code;
                this.isMobileLinkOpen = false;

                // Enviar nuestro código corto al Host para que nos identifique con él
                conn.send({
                    type: "handshake",
                    shortCode: this.peerId,
                    deviceType: "PC"
                });
            });

            conn.on("data", (data: any) => {
                this.handleIncomingPeerData(data, conn);
            });

            conn.on("close", () => {
                this.hostConnection = null;
                this.connectedHostCode = "";
            });

            conn.on("error", (err: any) => {
                console.error("Connection error:", err);
                this.hostConnection = null;
                this.connectedHostCode = "";
            });
        } catch (err) {
            console.error("Firebase fetch error:", err);
            alert("Error de conexión al buscar el código en el servidor.");
        }
    }

    broadcastToClients(data: any, skipPeerId?: string) {
        // Enviar a todos los clientes conectados si somos el anfitrión (saltándose el emisor original si aplica)
        this.clientConnections.forEach(conn => {
            if (conn.open && (!skipPeerId || conn.peer !== skipPeerId)) {
                conn.send(data);
            }
        });
        // Si somos un cliente, enviarlo al anfitrión para que lo distribuya
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send(data);
        }
    }

    async handleIncomingPeerData(data: any, conn?: DataConnection) {
        if (!data || !data.type) return;

        if (data.type === "error" && data.message) {
            alert(data.message);
            return;
        }

        if (data.type === "handshake") {
            if (conn) {
                (conn as any).shortCode = data.shortCode || "Dispositivo";
                (conn as any).deviceType = data.deviceType || "Desconocido";
                // Disparar reactividad reasignando la lista de conexiones
                this.clientConnections = [...this.clientConnections];
            }
            return;
        }

        if (data.type === "sync-state" && data.items) {
            this.items = data.items;
            return;
        }

        if (data.type === "delete" && data.id) {
            this.deleteItem(data.id, true);
            if (this.hostConnection === null) {
                this.broadcastToClients(data, conn?.peer);
            }
            return;
        }

        if (data.type === "update-bounds" && data.id) {
            this.updateItemBounds(data.id, data.x, data.y, data.w, data.h, data.z, true);
            if (this.hostConnection === null) {
                this.broadcastToClients(data, conn?.peer);
            }
            return;
        }

        if (data.type === "update-content" && data.id) {
            this.updateItemContent(data.id, data.content, true);
            if (this.hostConnection === null) {
                this.broadcastToClients(data, conn?.peer);
            }
            return;
        }

        if (data.type === "add-item" && data.item) {
            if (!this.items.find((i) => i.id === data.item.id)) {
                this.items = [...this.items, data.item];
                if (data.item.z >= this.maxZ) {
                    this.maxZ = data.item.z + 1;
                }
            }
            if (this.hostConnection === null) {
                this.broadcastToClients(data, conn?.peer);
            }
            return;
        }

        if (data.type === "request-file-data" && data.fileId) {
            const file = this.hostedFiles.get(data.fileId);
            if (file) {
                file.arrayBuffer().then(buffer => {
                    this.broadcastToClients({
                        type: "file-data",
                        fileId: data.fileId,
                        data: buffer,
                        name: file.name,
                        mimeType: file.type
                    });
                });
            } else if (this.hostConnection === null) {
                this.broadcastToClients(data, conn?.peer); // Reenviar a clientes
            }
            return;
        }

        if (data.type === "file-data" && data.fileId && data.data) {
            if (this.requestedFiles.has(data.fileId)) {
                this.requestedFiles.delete(data.fileId);
                const blob = new Blob([data.data], { type: data.mimeType || "application/octet-stream" });
                this.triggerDownload(blob, data.name);
            }
            if (this.hostConnection === null) {
                this.broadcastToClients(data, conn?.peer); // Reenviar a clientes
            }
            return;
        }

        if (data.type === "text" && data.content) {
            if (this.items.find((i) => i.type === "text" && i.content === data.content))
                return;
            this.addItem({ type: "text", content: data.content }, true);
        } else if (data.type === "image" && data.content) {
            let b64 = data.content;
            if (b64.startsWith("data:image")) {
                b64 = b64.split(",")[1];
            }
            await this.handleImageUpdate(b64, true);
        }
    }

    async handleExtractText(rect?: {
        top: number;
        left: number;
        width: number;
        height: number;
    }) {
        if (!this.ocrImageSrc) return;

        this.ocrLoading = true;
        this.ocrText = "";

        try {
            const worker = await createWorker("eng+spa");
            let recognizeOptions = undefined;
            if (rect) {
                recognizeOptions = { rectangle: rect };
            }

            const {
                data: { text },
            } = await worker.recognize(this.ocrImageSrc, recognizeOptions);
            await worker.terminate();
            this.ocrText = text;
        } catch (e: any) {
            console.error("OCR Error:", e);
            this.ocrText = "Ocurrió un error al extraer el texto: " + e;
        } finally {
            this.ocrLoading = false;
        }
    }

    async exportWorkspaces() {
        try {
            const data = JSON.stringify(this.workspaces, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const dateStr = new Date().toISOString().split("T")[0];
            await this.triggerDownload(blob, `anotapp-backup-${dateStr}.json`);
        } catch (err) {
            console.error("Error al exportar los datos:", err);
        }
    }

    async importWorkspaces(file: File) {
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                this.workspaces = parsed;
                let currentMaxZ = 1;
                this.workspaces.forEach(ws => {
                    ws.items.forEach(item => {
                        if (item.z && item.z >= currentMaxZ) currentMaxZ = item.z + 1;
                    });
                });
                this.maxZ = currentMaxZ;
                if (this.workspaces.length > 0) {
                    this.activeWorkspaceId = this.workspaces[0].id;
                }
            } else {
                alert("El archivo no tiene el formato correcto.");
            }
        } catch (err) {
            console.error("Error al importar los datos:", err);
            alert("Hubo un error al leer el archivo. Asegúrate de que sea un archivo JSON válido de Anotapp.");
        }
    }
}

export const desktopState = new DesktopState();
