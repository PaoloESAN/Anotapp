import { type ClipboardItem } from "$lib/types";
import { createWorker } from "tesseract.js";
import { syncService } from "$lib/sync-service.svelte";

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

    get activeWorkspace(): Workspace {
        const found = this.workspaces?.find(ws => ws.id === this.activeWorkspaceId);
        if (found) return found;
        if (this.workspaces && this.workspaces.length > 0) return this.workspaces[0];
        const defaultWs: Workspace = { id: "ws-default", name: "Mesa 1", items: [] };
        this.workspaces = [defaultWs];
        this.activeWorkspaceId = defaultWs.id;
        return defaultWs;
    }

    get items(): ClipboardItem[] {
        return this.activeWorkspace?.items || [];
    }

    set items(newItems: ClipboardItem[]) {
        const ws = this.workspaces?.find(ws => ws.id === this.activeWorkspaceId) || this.workspaces?.[0];
        if (ws) ws.items = newItems;
    }

    maxZ = $state(100);
    lastText = $state("");
    lastImageB64Len = $state(0);
    lastFilesKey = $state("");
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

    get peerId() {
        return syncService.roomCode;
    }
    set peerId(val: string) {
        syncService.roomCode = val;
    }
    peerInstance: any = null;

    draggedItemId = $state<string | null>(null);
    pointerY = $state(0);

    ocrText = $state("");
    ocrLoading = $state(false);
    ocrImageSrc = $state("");
    isOcrModalOpen = $state(false);
    isMobileLinkOpen = $state(false);

    get hostConnection() {
        return !syncService.isHost && syncService.status === "connected" ? ({} as any) : null;
    }
    set hostConnection(_val: any) {
        if (!_val) syncService.disconnect();
    }

    get connectedHostCode() {
        return !syncService.isHost ? syncService.roomCode : "";
    }

    get clientConnections() {
        const count = Math.max(0, syncService.deviceCount - 1);
        return Array.from({ length: count }, (_, i) => ({
            peer: `device-${i + 1}`,
            shortCode: `Dispositivo ${i + 1}`,
            open: true,
            close: () => {},
        }));
    }
    set clientConnections(_val: any) {}

    hostedFiles = new Map<string, File>();
    requestedFiles = new Set<string>();

    private isInitialized = false;

    constructor() {
        if (typeof localStorage !== "undefined") {
            try {
                const savedWS = localStorage.getItem("anotapp-workspaces");
                if (savedWS) {
                    try {
                        const parsed = JSON.parse(savedWS);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            this.workspaces = parsed;
                            // Calculate maxZ across all workspaces
                            let currentMaxZ = 100;
                            this.workspaces.forEach(ws => {
                                if (!Array.isArray(ws.items)) ws.items = [];
                                ws.items.forEach(item => {
                                    if (item.z && item.z >= currentMaxZ) currentMaxZ = item.z + 1;
                                });
                            });
                            this.maxZ = currentMaxZ;
                        }
                    } catch (parseErr) {
                        console.warn("Could not parse saved workspaces:", parseErr);
                    }
                }

                const savedActiveWS = localStorage.getItem("anotapp-active-ws");
                if (savedActiveWS && this.workspaces.find(ws => ws.id === savedActiveWS)) {
                    this.activeWorkspaceId = savedActiveWS;
                } else if (this.workspaces[0]) {
                    this.activeWorkspaceId = this.workspaces[0].id;
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
        if (this.isInitialized) return;
        this.isInitialized = true;
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

        syncService.setStateSyncProvider(() => ({
            workspaces: this.workspaces,
            activeWorkspaceId: this.activeWorkspaceId,
            items: this.items,
        }));

        syncService.onMessage((data) => {
            this.handleIncomingPeerData(data);
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

    viewportCenterProvider: (() => { x: number; y: number }) | null = null;

    getRandomPosition(w: number, h: number): { x: number; y: number } {
        if (typeof window === "undefined") {
            return { x: 100, y: 100 };
        }
        if (this.viewportCenterProvider) {
            const center = this.viewportCenterProvider();
            const jitterX = (Math.random() - 0.5) * 120;
            const jitterY = (Math.random() - 0.5) * 120;
            return {
                x: Math.round(center.x - w / 2 + jitterX),
                y: Math.round(center.y - h / 2 + jitterY),
            };
        }
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const areaW = screenW * 0.8;
        const areaH = screenH * 0.8;

        const minX = (screenW - areaW) / 2;
        const minY = (screenH - areaH) / 2;

        const maxX = Math.max(minX, minX + areaW - w);
        const maxY = Math.max(minY, minY + areaH - h);

        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);

        return { x, y };
    }

    addItem({
        type,
        content,
        files,
        fileId,
        downloadUrl,
        name,
        size,
        w,
        h,
    }: {
        type: "text" | "image" | "files" | "peer-file";
        content: string;
        files?: string[];
        fileId?: string;
        downloadUrl?: string;
        name?: string;
        size?: number;
        w?: number;
        h?: number;
    }, fromPeer = false) {
        const defaultW = type === "text" ? 300 : 200;
        const defaultH = type === "text" ? 160 : 200;
        const finalW = w ?? defaultW;
        const finalH = h ?? defaultH;
        const pos = this.getRandomPosition(finalW, finalH);

        const newItem: ClipboardItem = {
            id: crypto.randomUUID(),
            type,
            content,
            files,
            fileId,
            downloadUrl,
            name,
            size,
            x: pos.x,
            y: pos.y,
            z: this.maxZ++,
            w,
            h,
        };
        this.items = [...this.items, newItem];

        if (!fromPeer) {
            this.broadcastToClients({ type: "add-item", item: newItem });
        }
    }

    addEmptyText() {
        const w = 280;
        const h = 150;
        const pos = this.getRandomPosition(w, h);
        const newItem = {
            id: crypto.randomUUID(),
            type: "text" as const,
            content: "",
            x: pos.x,
            y: pos.y,
            z: this.maxZ++,
            w,
            h,
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
        this.lastFilesKey = key;
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
        const w = 240;
        const h = 120;
        const pos = this.getRandomPosition(w, h);
        const newItem = {
            id: crypto.randomUUID(),
            type: "peer-file" as const,
            content: "",
            fileId,
            name,
            size,
            x: pos.x,
            y: pos.y,
            z: this.maxZ++,
            w,
            h,
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

        for (const ws of this.workspaces) {
            const item = ws.items.find((i) => i.fileId === fileId || i.id === fileId);
            if (item && item.downloadUrl) {
                const a = document.createElement("a");
                a.href = item.downloadUrl;
                a.download = item.name || "descarga";
                a.target = "_blank";
                a.click();
                return;
            }
        }

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

    findItemAcrossWorkspaces(id: string) {
        for (const ws of this.workspaces) {
            const item = ws.items.find(i => i.id === id);
            if (item) return { item, workspace: ws };
        }
        return null;
    }

    deleteItem(id: string, fromPeer = false) {
        const found = this.findItemAcrossWorkspaces(id);
        if (found) {
            const { item } = found;
            if (item.type === "text" && item.content === this.lastText) {
                this.lastText = "";
                if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
                    import("tauri-plugin-clipboard-api")
                        .then(({ clear }) => clear())
                        .catch((err) => console.error("Error clearing clipboard:", err));
                }
            } else if (item.type === "image") {
                const b64 = item.content.replace(/^data:[^;]+;base64,/, "");
                if (b64.length === this.lastImageB64Len) {
                    this.lastImageB64Len = 0;
                    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
                        import("tauri-plugin-clipboard-api")
                            .then(({ clear }) => clear())
                            .catch((err) => console.error("Error clearing clipboard:", err));
                    }
                }
            } else if (item.type === "files") {
                const key = [...(item.files ?? [])].sort().join("|");
                if (key === this.lastFilesKey) {
                    this.lastFilesKey = "";
                    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
                        import("tauri-plugin-clipboard-api")
                            .then(({ clear }) => clear())
                            .catch((err) => console.error("Error clearing clipboard:", err));
                    }
                }
            }
        }

        for (const ws of this.workspaces) {
            ws.items = ws.items.filter((i) => i.id !== id);
        }
        if (!fromPeer) {
            this.broadcastToClients({ type: "delete", id });
        }
    }

    updateItemBounds(id: string, x: number, y: number, w: number | undefined, h: number | undefined, z: number | undefined, fromPeer = false) {
        const found = this.findItemAcrossWorkspaces(id);
        if (found) {
            const { item } = found;
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
        const found = this.findItemAcrossWorkspaces(id);
        if (found && found.item.type === "text") {
            found.item.content = content;
        }
        if (!fromPeer) {
            this.broadcastToClients({ type: "update-content", id, content });
        }
    }

    async registerPeerMapping(preferredCode?: string): Promise<string> {
        return await syncService.createOrJoinHost(preferredCode);
    }

    async connectToHost(shortCode: string) {
        if (!shortCode) return;
        try {
            await syncService.connectToRoom(shortCode);
            this.isMobileLinkOpen = false;
        } catch (err) {
            console.error("Firebase/Sync error:", err);
            alert("Error al conectar con la sala en el servidor.");
        }
    }

    broadcastToClients(data: any, _skipPeerId?: string) {
        syncService.broadcast(data);
    }

    async handleIncomingPeerData(data: any, _conn?: any) {
        if (!data || !data.type) return;

        if (data.type === "error" && data.message) {
            alert(data.message);
            return;
        }

        if (data.type === "sync-state") {
            if (data.workspaces && Array.isArray(data.workspaces)) {
                this.workspaces = data.workspaces;
                if (data.activeWorkspaceId) {
                    this.activeWorkspaceId = data.activeWorkspaceId;
                }
            } else if (data.items && Array.isArray(data.items)) {
                this.items = data.items;
            }
            return;
        }


        if (data.type === "delete" && data.id) {
            this.deleteItem(data.id, true);
            return;
        }

        if (data.type === "update-bounds" && data.id) {
            this.updateItemBounds(data.id, data.x, data.y, data.w, data.h, data.z, true);
            return;
        }

        if (data.type === "update-content" && data.id) {
            this.updateItemContent(data.id, data.content, true);
            return;
        }

        if (data.type === "add-item" && data.item) {
            const found = this.findItemAcrossWorkspaces(data.item.id);
            if (!found) {
                this.items = [...this.items, data.item];
                if (data.item.z >= this.maxZ) {
                    this.maxZ = data.item.z + 1;
                }
            }
            return;
        }

        if (data.type === "file-transfer-ready") {
            // Si fue solicitado bajo demanda (al pulsar el botón Descargar), actualizamos la URL y disparamos descarga directa
            if (data.isOnDemand || this.requestedFiles.has(data.fileId)) {
                this.requestedFiles.delete(data.fileId);
                for (const ws of this.workspaces) {
                    const existing = ws.items.find((i) => i.fileId === data.fileId || i.id === data.fileId);
                    if (existing) {
                        existing.downloadUrl = data.downloadUrl;
                    }
                }
                if (data.blob) {
                    this.triggerDownload(data.blob, data.name);
                }
                return;
            }

            // Si ya existe la tarjeta con ese fileId, solo le asignamos el downloadUrl listo
            for (const ws of this.workspaces) {
                const existing = ws.items.find((i) => i.fileId === data.fileId);
                if (existing) {
                    existing.downloadUrl = data.downloadUrl;
                    return;
                }
            }

            const isImage = data.isImage || (data.mimeType && data.mimeType.startsWith("image/"));
            if (isImage) {
                this.addItem({
                    type: "image",
                    content: data.downloadUrl,
                    name: data.name,
                    downloadUrl: data.downloadUrl,
                    size: data.size,
                    fileId: data.fileId,
                }, true);
            } else {
                this.addItem({
                    type: "peer-file",
                    content: "",
                    name: data.name,
                    size: data.size,
                    fileId: data.fileId,
                    downloadUrl: data.downloadUrl,
                }, true);
            }
            return;
        }

        if (data.type === "request-file-data" && data.fileId) {
            const file = this.hostedFiles.get(data.fileId);
            if (file) {
                syncService.transferFile(file, undefined, data.fileId, true).catch((err) =>
                    console.error("Error enviando archivo bajo demanda:", err)
                );
            }
            return;
        }

        if (data.type === "file-data" && data.fileId && data.data) {
            if (this.requestedFiles.has(data.fileId)) {
                this.requestedFiles.delete(data.fileId);
                const blob = new Blob([data.data], { type: data.mimeType || "application/octet-stream" });
                this.triggerDownload(blob, data.name);
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
