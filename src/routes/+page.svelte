<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import type { ClipboardItem } from "$lib/types";
    import ClipboardCard from "$lib/components/ClipboardCard.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import ClearAllAlert from "$lib/components/ClearAllAlert.svelte";
    import ActionButtons from "$lib/components/ActionButtons.svelte";
    import PauseButton from "$lib/components/PauseButton.svelte";
    import Titlebar from "$lib/components/Titlebar.svelte";
    import MobileLinkModal from "$lib/components/modals/MobileLinkModal.svelte";
    import SettingsModal from "$lib/components/modals/SettingsModal.svelte";
    import OcrResultModal from "$lib/components/modals/OcrResultModal.svelte";
    import CanvasBackground from "$lib/components/CanvasBackground.svelte";
    import CanvasControls from "$lib/components/CanvasControls.svelte";
    import CanvasMinimap from "$lib/components/CanvasMinimap.svelte";
    import WorkspacesBar from "$lib/components/WorkspacesBar.svelte";
    import CardContextMenu from "$lib/components/CardContextMenu.svelte";
    import ScannerView from "$lib/components/ScannerView.svelte";
    import { desktopState } from "./desktop-state.svelte";
    import { interactionManager } from "./interaction-manager.svelte";
    import { syncService } from "$lib/sync-service.svelte";
    import { renderMarkdown } from "$lib/markdown";

    // UI Icons
    import QrCode from "@lucide/svelte/icons/qr-code";
    import Camera from "@lucide/svelte/icons/camera";
    import ImagePlus from "@lucide/svelte/icons/image-plus";
    import Paperclip from "@lucide/svelte/icons/paperclip";
    import FileIcon from "@lucide/svelte/icons/file";
    import ArrowUp from "@lucide/svelte/icons/arrow-up";
    import Loader2 from "@lucide/svelte/icons/loader-2";
    import Check from "@lucide/svelte/icons/check";
    import Copy from "@lucide/svelte/icons/copy";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import Pen from "@lucide/svelte/icons/pen";
    import ScanText from "@lucide/svelte/icons/scan-text";
    import Download from "@lucide/svelte/icons/download";
    import LayoutGrid from "@lucide/svelte/icons/layout-grid";
    import List from "@lucide/svelte/icons/list";
    import Settings from "@lucide/svelte/icons/settings";
    import Plus from "@lucide/svelte/icons/plus";
    import X from "@lucide/svelte/icons/x";
    import Unplug from "@lucide/svelte/icons/unplug";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import Zap from "@lucide/svelte/icons/zap";
    import UploadCloud from "@lucide/svelte/icons/upload-cloud";

    // UI Components
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
    import * as Dialog from "$lib/components/ui/dialog";

    desktopState.initSerialization();

    let isSettingsOpen = $state(false);
    let isMobile = $state(false);
    let isTauri = $state(false);
    let mobileViewMode = $state<"cards" | "canvas">("cards");
    let mobileTextInput = $state("");
    let isUploading = $state(false);
    let isScanModalOpen = $state(false);
    let manualCodeInput = $state("");
    let isScannerActive = $state(false);
    let copiedNoteId = $state<string | null>(null);
    let isDraggingFileOver = $state(false);
    let dragCounter = 0;

    let stopListening: (() => Promise<void>) | null = null;

    function handleDragEnter(e: DragEvent) {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        dragCounter++;
        isDraggingFileOver = true;
    }

    function handleDragOver(e: DragEvent) {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
        }
        isDraggingFileOver = true;
    }

    function handleDragLeave(e: DragEvent) {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) {
            isDraggingFileOver = false;
        }
    }

    async function handleDrop(e: DragEvent) {
        e.preventDefault();
        dragCounter = 0;
        isDraggingFileOver = false;

        const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
        if (files.length === 0) return;

        const basePos = interactionManager.screenToCanvas(
            e.clientX || window.innerWidth / 2,
            e.clientY || window.innerHeight / 2,
        );

        for (let idx = 0; idx < files.length; idx++) {
            const file = files[idx];
            const offset = idx * 28;
            const isImage = file.type.startsWith("image/");
            const fileId = crypto.randomUUID();
            const localUrl = URL.createObjectURL(file);
            desktopState.hostedFiles.set(fileId, file);

            if (isImage) {
                const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve((ev.target?.result as string) || "");
                    reader.readAsDataURL(file);
                });

                desktopState.addItem(
                    {
                        type: "image",
                        content: dataUrl,
                        name: file.name,
                        size: file.size,
                        fileId,
                        downloadUrl: localUrl,
                        x: Math.round(basePos.x - 130 + offset),
                        y: Math.round(basePos.y - 110 + offset),
                    },
                    true,
                );
            } else {
                desktopState.addItem(
                    {
                        type: "peer-file",
                        content: "",
                        name: file.name,
                        size: file.size,
                        fileId,
                        downloadUrl: localUrl,
                        w: 240,
                        h: 120,
                        x: Math.round(basePos.x - 120 + offset),
                        y: Math.round(basePos.y - 60 + offset),
                    },
                    true,
                );
            }

            if (syncService.status === "connected" && syncService.roomCode) {
                try {
                    await syncService.transferFile(file, undefined, fileId, false);
                } catch (err) {
                    console.error("Error transmitiendo archivo arrastrado:", err);
                }
            }
        }
    }

    function onDelete(id: string) {
        desktopState.deleteItem(id);
    }

    function onScanText(item: ClipboardItem) {
        if (item.type !== "image" || !item.content) return;
        desktopState.ocrImageSrc = item.content;
        desktopState.ocrText = "";
        desktopState.isOcrModalOpen = true;
    }

    async function onCopy(item: ClipboardItem) {
        try {
            if (isTauri) {
                const {
                    writeText,
                    writeImageBase64,
                    writeFilesURIs,
                } = await import("tauri-plugin-clipboard-api");

                if (item.type === "text" && item.content) {
                    await writeText(item.content);
                    desktopState.lastText = item.content;
                } else if (item.type === "image" && item.content) {
                    const b64 = item.content.replace(/^data:[^;]+;base64,/, "");
                    await writeImageBase64(b64);
                    desktopState.lastImageB64Len = b64.length;
                } else if (item.type === "files" && item.files?.length) {
                    await writeFilesURIs(item.files);
                    desktopState.lastFilesKey = [...item.files].sort().join("|");
                }
            } else {
                if (item.type === "text" && item.content && navigator.clipboard) {
                    await navigator.clipboard.writeText(item.content);
                    desktopState.lastText = item.content;
                    copiedNoteId = item.id;
                    setTimeout(() => (copiedNoteId = null), 2000);
                }
            }
        } catch (err) {
            console.log("Error al copiar al portapapeles:", err);
        }
    }

    async function handleGlobalContextMenu(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const cardDiv = target.closest("[data-card-id]");

        if (cardDiv) {
            const cardId = cardDiv.getAttribute("data-card-id");
            const item = desktopState.items.find((i) => i.id === cardId);

            if (item) {
                e.preventDefault();
                e.stopPropagation();

                if (desktopState.contextMenu.open) {
                    desktopState.contextMenu.open = false;
                    await tick();
                }

                setTimeout(async () => {
                    await tick();
                    desktopState.contextMenu.x = e.clientX;
                    desktopState.contextMenu.y = e.clientY;
                    desktopState.contextMenu.item = item;
                    desktopState.contextMenu.open = true;
                }, 20);
            }
        }
    }

    function checkScreenSize() {
        if (typeof window !== "undefined") {
            isMobile = window.innerWidth < 768;
        }
    }

    onMount(async () => {
        checkScreenSize();
        window.addEventListener("resize", checkScreenSize);
        window.addEventListener("contextmenu", handleGlobalContextMenu, {
            capture: true,
        });
        window.addEventListener("anotapp-bg-updated", ((e: CustomEvent) => {
            desktopState.customBgImage = e.detail;
        }) as EventListener);

        isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

        // Si estamos en Tauri desktop, activar listeners nativos del portapapeles
        if (isTauri) {
            try {
                const {
                    startListening,
                    onTextUpdate,
                    onImageUpdate,
                    onFilesUpdate,
                } = await import("tauri-plugin-clipboard-api");

                stopListening = await startListening();
                await onTextUpdate((text) => {
                    if (desktopState.clipboardPaused) return;
                    if (!text || text === desktopState.lastText) return;
                    if (
                        desktopState.items.find(
                            (i) => i.type === "text" && i.content === text,
                        )
                    )
                        return;
                    desktopState.lastText = text;
                    desktopState.addItem({ type: "text", content: text });
                });
                await onImageUpdate((b64) => {
                    if (!desktopState.clipboardPaused)
                        desktopState.handleImageUpdate(b64);
                });
                await onFilesUpdate((files) => {
                    if (!desktopState.clipboardPaused)
                        desktopState.handleFilesUpdate(files);
                });
            } catch (err) {
                console.warn("Listeners nativos de portapapeles no disponibles:", err);
            }
        }

        // Auto-conexión SOLO si hay parámetro room o peerId en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get("room") || urlParams.get("peerId") || "";

        try {
            if (roomParam) {
                const upper = roomParam.trim().toUpperCase();
                sessionStorage.setItem("anotapp_room", upper);
                await syncService.connectToRoom(upper);
            }
        } catch (err) {
            console.error("Error al conectar a la sala desde URL:", err);
        }

        setTimeout(() => (desktopState.isReady = true), 300);
    });

    onDestroy(async () => {
        if (typeof window !== "undefined") {
            window.removeEventListener("resize", checkScreenSize);
            window.removeEventListener("contextmenu", handleGlobalContextMenu, {
                capture: true,
            });
        }
        if (stopListening) await stopListening();
    });

    function sendQuickText() {
        const text = mobileTextInput.trim();
        if (!text) return;
        desktopState.addItem({
            type: "text",
            content: text,
        });
        mobileTextInput = "";
    }

    async function handleFileUpload(e: Event) {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        isUploading = true;
        try {
            const isImage = file.type.startsWith("image/");
            // Usar transferencia P2P directa / WebSocket stream (sin límites, 0 RAM en server)
            const transferRes = await syncService.transferFile(file);

            if (isImage) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    desktopState.addItem({
                        type: "image",
                        content: dataUrl,
                        name: file.name,
                        downloadUrl: transferRes.downloadUrl,
                        fileId: transferRes.fileId,
                        size: file.size,
                    }, true);
                };
                reader.readAsDataURL(file);
            } else {
                desktopState.addItem({
                    type: "peer-file",
                    content: "",
                    name: file.name,
                    size: file.size,
                    fileId: transferRes.fileId,
                    downloadUrl: transferRes.downloadUrl,
                }, true);
            }
        } catch (err) {
            console.error("Error al transferir archivo:", err);
            if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    desktopState.addItem({
                        type: "image",
                        content: event.target?.result as string,
                        name: file.name,
                    });
                };
                reader.readAsDataURL(file);
            }
        } finally {
            isUploading = false;
            target.value = "";
        }
    }

    async function handleConnectManual(e?: Event) {
        if (e) e.preventDefault();
        const code = manualCodeInput.trim().toUpperCase();
        if (!code) return;

        try {
            await syncService.connectToRoom(code);
            sessionStorage.setItem("anotapp_room", code);
            manualCodeInput = "";
            isScanModalOpen = false;
        } catch (err) {
            alert("Error al conectar a la sala: " + err);
        }
    }

    function handleScanResult(scanned: string) {
        try {
            const url = new URL(scanned);
            const roomCode = url.searchParams.get("room") || url.searchParams.get("peerId");
            if (roomCode) {
                manualCodeInput = roomCode;
                handleConnectManual();
                isScannerActive = false;
                return;
            }
        } catch {}

        if (scanned && scanned.length > 0) {
            manualCodeInput = scanned.trim().toUpperCase();
            handleConnectManual();
        }
        isScannerActive = false;
    }
</script>

<svelte:head>
    <title>Anotapp</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
</svelte:head>

<svelte:window
    onpointermove={(e) => interactionManager.onPointerMove(e)}
    onpointerup={(e) => interactionManager.onPointerUp(e)}
    onpointercancel={(e) => interactionManager.onPointerUp(e)}
    onresize={() => interactionManager.onWindowResize()}
    ondragenter={handleDragEnter}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
/>

<main
    class="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 relative font-sans isolate selection:bg-primary/30 transition-colors duration-500 flex flex-col"
>
    <!-- Background visual canvas -->
    <CanvasBackground />

    {#if isTauri}
        <Titlebar />
    {/if}

    {#if isDraggingFileOver}
        <div class="fixed inset-0 z-[9998] pointer-events-none bg-primary/10 backdrop-blur-[2px] border-2 border-dashed border-primary/60 m-3 rounded-3xl flex items-center justify-center animate-in fade-in duration-150">
            <div class="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl px-6 py-4 rounded-2xl shadow-2xl border border-primary/30 flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                    <UploadCloud class="w-5 h-5" />
                </div>
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-slate-800 dark:text-zinc-100">Suelta tus archivos o imágenes aquí</span>
                    <span class="text-xs text-slate-500 dark:text-zinc-400">Se colocarán en el lienzo y se sincronizarán al instante</span>
                </div>
            </div>
        </div>
    {/if}

    <!-- ============================================== -->
    <!-- TOP BAR (SOLO MÓVIL)                          -->
    <!-- ============================================== -->
    {#if isMobile}
        <header class="h-14 w-full flex items-center justify-between px-3 sm:px-6 z-50 backdrop-blur-md bg-white/40 dark:bg-zinc-950/40 border-b border-slate-200/50 dark:border-zinc-800/50 shrink-0">
            <!-- Logo / App Name -->
            <div class="flex items-center gap-2">
                <span class="font-bold tracking-tight text-lg text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <span>Anotapp<span class="text-primary">.</span></span>
                </span>
            </div>

            <!-- Center / Workspace Switcher (Mobile) -->
            <div class="flex items-center gap-1.5">
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                        {#snippet child({ props })}
                            <Button {...props} variant="outline" size="sm" class="h-8 rounded-full text-xs font-medium gap-1.5 bg-background/60">
                                <span>{desktopState.activeWorkspace.name}</span>
                                <ChevronDown class="w-3.5 h-3.5 opacity-60" />
                            </Button>
                        {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="center" class="w-44 rounded-xl">
                        {#each desktopState.workspaces as ws (ws.id)}
                            <DropdownMenu.Item
                                onclick={() => (desktopState.activeWorkspaceId = ws.id)}
                                class="cursor-pointer text-xs justify-between"
                            >
                                <span class={ws.id === desktopState.activeWorkspaceId ? "font-bold text-primary" : ""}>
                                    {ws.name}
                                </span>
                                {#if ws.id === desktopState.activeWorkspaceId}
                                    <Check class="w-3.5 h-3.5 text-primary" />
                                {/if}
                            </DropdownMenu.Item>
                        {/each}
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                            onclick={() => {
                                const newId = "ws-" + Date.now();
                                const newNum = desktopState.workspaces.length + 1;
                                desktopState.workspaces = [
                                    ...desktopState.workspaces,
                                    { id: newId, name: `Mesa ${newNum}`, items: [] },
                                ];
                                desktopState.activeWorkspaceId = newId;
                            }}
                            class="cursor-pointer text-xs gap-1.5 text-primary"
                        >
                            <Plus class="w-3.5 h-3.5" />
                            <span>Nueva Mesa</span>
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>

                <!-- Connection Status Badge / Vincular Button (Mobile) -->
                {#if syncService.status === "connected" && syncService.roomCode}
                    <div class="flex items-center gap-1.5">
                        <button
                            onclick={() => (isScanModalOpen = true)}
                            class="h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-all cursor-pointer shadow-xs"
                            title="Sala activa. Haz clic para ver detalles"
                        >
                            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span class="font-mono tracking-wider">{syncService.roomCode}</span>
                            {#if syncService.deviceCount > 1}
                                <span class="text-[10px] bg-green-500/20 px-1 rounded-sm ml-0.5">{syncService.deviceCount}</span>
                            {/if}
                        </button>
                    </div>
                {:else if syncService.status === "connecting" || syncService.status === "reconnecting"}
                    <div class="h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Loader2 class="w-3.5 h-3.5 animate-spin" />
                        <span>Conectando...</span>
                    </div>
                {:else}
                    <button
                        onclick={() => (isScanModalOpen = true)}
                        class="h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer shadow-xs"
                    >
                        <QrCode class="w-3.5 h-3.5" />
                        <span>Vincular</span>
                    </button>
                {/if}
            </div>

            <!-- Right / Actions (Mobile) -->
            <div class="flex items-center gap-1">
                <!-- Toggle View Mode: Feed vs Canvas -->
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 rounded-full"
                    onclick={() => (mobileViewMode = mobileViewMode === "cards" ? "canvas" : "cards")}
                    title={mobileViewMode === "cards" ? "Ver Lienzo infinito" : "Ver Lista de tarjetas"}
                >
                    {#if mobileViewMode === "cards"}
                        <LayoutGrid class="w-4 h-4 text-slate-700 dark:text-zinc-300" />
                    {:else}
                        <List class="w-4 h-4 text-slate-700 dark:text-zinc-300" />
                    {/if}
                </Button>

                <!-- Settings Button -->
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 rounded-full"
                    onclick={() => (isSettingsOpen = true)}
                    title="Configuración"
                >
                    <Settings class="w-4 h-4 text-slate-700 dark:text-zinc-300" />
                </Button>
            </div>
        </header>
    {/if}

    <!-- ============================================== -->
    <!-- MAIN CONTENT VIEW                             -->
    <!-- ============================================== -->
    <div class="flex-1 relative overflow-hidden w-full h-full flex flex-col">
        {#if isMobile && mobileViewMode === "cards"}
            <!-- MOBILE CARDS FEED VIEW (TOUCH-OPTIMIZED) -->
            <div class="flex-1 overflow-y-auto px-4 py-4 pb-28 space-y-3 custom-scrollbar">
                {#if desktopState.items.length === 0}
                    <div class="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-zinc-500">
                        <div class="w-12 h-12 rounded-2xl bg-slate-200/50 dark:bg-zinc-800/50 flex items-center justify-center mb-3 text-slate-500 dark:text-zinc-400">
                            <Pen class="w-6 h-6 stroke-1.5" />
                        </div>
                        <p class="font-semibold text-sm text-slate-700 dark:text-zinc-300">Mesa vacía</p>
                        <p class="text-xs text-slate-500 dark:text-zinc-500 max-w-xs mt-1">
                            Envía notas, imágenes o archivos usando la barra inferior o escanea el QR de tu PC para sincronizar.
                        </p>
                    </div>
                {:else}
                    {#each desktopState.items as item (item.id)}
                        <div class="w-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-2xl p-4 border border-slate-200/80 dark:border-zinc-800/80 shadow-xs flex flex-col gap-2 transition-all">
                            <!-- Card Header -->
                            <div class="flex items-center justify-between text-xs text-slate-400 dark:text-zinc-500 pb-1 border-b border-slate-100 dark:border-zinc-800/50">
                                <span class="capitalize font-medium text-[11px] tracking-wide text-primary">
                                    {item.type === "text" ? "Nota de texto" : item.type === "image" ? "Imagen" : "Archivo"}
                                </span>
                                <div class="flex items-center gap-1">
                                    <button
                                        onclick={() => onCopy(item)}
                                        class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors"
                                        title="Copiar"
                                    >
                                        {#if copiedNoteId === item.id}
                                            <Check class="w-3.5 h-3.5 text-green-500" />
                                        {:else}
                                            <Copy class="w-3.5 h-3.5" />
                                        {/if}
                                    </button>
                                    {#if item.type === "image"}
                                        <button
                                            onclick={() => onScanText(item)}
                                            class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors"
                                            title="Extraer texto OCR"
                                        >
                                            <ScanText class="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onclick={() => desktopState.downloadImageItem(item)}
                                            class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors"
                                            title="Descargar imagen"
                                        >
                                            <Download class="w-3.5 h-3.5" />
                                        </button>
                                    {/if}
                                    <button
                                        onclick={() => onDelete(item.id)}
                                        class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 transition-colors"
                                        title="Eliminar"
                                    >
                                        <Trash2 class="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <!-- Card Body -->
                            {#if item.type === "text"}
                                <div
                                    class="font-sans break-words leading-relaxed text-slate-800 dark:text-zinc-100 max-h-48 overflow-y-auto"
                                    style="font-size: {item.fontSize || 13}px;"
                                >
                                    {@html renderMarkdown(item.content)}
                                </div>
                            {:else if item.type === "image"}
                                <div class="w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-zinc-950 flex items-center justify-center border border-slate-200/50 dark:border-zinc-800/50">
                                    <img
                                        src={item.content}
                                        alt={item.name || "Imagen"}
                                        class="max-h-64 w-auto object-contain"
                                        loading="lazy"
                                    />
                                </div>
                                <button
                                    onclick={() => desktopState.downloadImageItem(item)}
                                    class="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline pt-1 self-start cursor-pointer"
                                >
                                    <Download class="w-3.5 h-3.5" />
                                    <span>Descargar imagen</span>
                                </button>
                            {:else}
                                <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/50 dark:border-zinc-800/50">
                                    <div class="p-2.5 rounded-lg bg-primary/10 text-primary">
                                        <FileIcon class="w-5 h-5" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs font-semibold truncate text-slate-800 dark:text-zinc-100">
                                            {item.name || "Archivo compartido"}
                                        </p>
                                        {#if item.size}
                                            <p class="text-[11px] text-slate-400 dark:text-zinc-500">
                                                {(item.size / 1024).toFixed(1)} KB
                                            </p>
                                        {/if}
                                    </div>
                                    <button
                                        onclick={() => desktopState.requestFile(item.fileId || item.id)}
                                        class="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
                                        title="Descargar archivo"
                                    >
                                        <Download class="w-4 h-4" />
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>
        {:else}
            <!-- INFINITE CANVAS VIEW (DESKTOP & MOBILE CANVAS MODE) -->
            <div
                role="region"
                aria-label="Lienzo infinito"
                class="flex-1 relative overflow-hidden w-full h-full touch-none select-none {interactionManager.isPanning ? 'cursor-grabbing' : interactionManager.isSpacePressed ? 'cursor-grab' : 'cursor-default'}"
                onpointerdown={(e) => interactionManager.onCanvasPointerDown(e)}
                onwheel={(e) => interactionManager.onCanvasWheel(e)}
            >
                <!-- World transformation layer -->
                <div
                    class="absolute top-0 left-0 w-full h-full pointer-events-none"
                    style="
                        transform: translate3d({interactionManager.pan.x}px, {interactionManager.pan.y}px, 0px) scale({interactionManager.zoom});
                        transform-origin: 0 0;
                    "
                >
                    <EmptyState
                        isReady={desktopState.isReady}
                        hasItems={desktopState.items.length > 0}
                    />

                    {#each desktopState.items as _, i (desktopState.items[i].id)}
                        <ClipboardCard
                            bind:item={desktopState.items[i]}
                            onBringToFront={(id) => {
                                const item = desktopState.items.find((i) => i.id === id);
                                if (item) item.z = desktopState.maxZ++;
                            }}
                            onDragStart={(e, id) => interactionManager.onDragStart(e, id)}
                            onResizeStart={(e, id, dir) =>
                                interactionManager.onResizeStart(e, id, dir)}
                            {onDelete}
                            {onCopy}
                            {onScanText}
                            hideHeaders={desktopState.hideHeaders}
                            hideCardButtons={desktopState.hideCardButtons}
                        />
                    {/each}
                </div>

                <!-- Floating Canvas Controls & Minimap (Top-Right on Desktop, Bottom-Left on Mobile Canvas) -->
                <div class="fixed {isMobile ? 'bottom-20 left-3 items-start' : (isTauri ? 'top-12 right-5 items-end' : 'top-5 right-5 items-end')} z-40 flex flex-col gap-2 pointer-events-auto">
                    <div class="flex items-center gap-2">
                        {#if !isMobile && syncService.status === "connected" && syncService.roomCode}
                            <button
                                onclick={() => (desktopState.isMobileLinkOpen = true)}
                                class="h-10 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl text-green-700 dark:text-green-400 border border-green-500/30 hover:bg-green-500/15 transition-all cursor-pointer shadow-lg"
                                title="Sala activa. Haz clic para ver detalles"
                            >
                                <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span class="font-mono tracking-wider">{syncService.roomCode}</span>
                                {#if syncService.deviceCount > 1}
                                    <span class="text-[10px] bg-green-500/20 px-1.5 py-0.5 rounded-full ml-0.5">{syncService.deviceCount}</span>
                                {/if}
                                {#if syncService.p2pStatus === "connected"}
                                    <Zap class="w-3 h-3 fill-emerald-500 text-emerald-500 ml-0.5" />
                                {/if}
                            </button>
                        {:else if !isMobile && (syncService.status === "connecting" || syncService.status === "reconnecting")}
                            <div class="h-10 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-lg">
                                <Loader2 class="w-3.5 h-3.5 animate-spin" />
                                <span>Conectando...</span>
                            </div>
                        {/if}
                        <CanvasControls />
                    </div>
                    {#if interactionManager.showMinimap}
                        <CanvasMinimap />
                    {/if}
                </div>

                <!-- Desktop Bottom Workspace Bar -->
                {#if !isMobile}
                    <WorkspacesBar />
                {/if}
            </div>
        {/if}
    </div>

    <!-- ============================================== -->
    <!-- MOBILE QUICK SEND & ATTACHMENT BAR            -->
    <!-- ============================================== -->
    {#if isMobile}
        <div class="fixed bottom-0 left-0 right-0 z-50 p-3 backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-t border-slate-200/50 dark:border-zinc-800/50 shadow-lg pb-safe">
            <div class="max-w-xl mx-auto flex items-center gap-1.5">
                <!-- Camera Button -->
                <label class="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 active:scale-95 transition-all cursor-pointer">
                    <Camera class="w-4 h-4" />
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        class="hidden"
                        onchange={handleFileUpload}
                        disabled={isUploading}
                    />
                </label>

                <!-- Gallery Photo Button -->
                <label class="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 active:scale-95 transition-all cursor-pointer">
                    <ImagePlus class="w-4 h-4" />
                    <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onchange={handleFileUpload}
                        disabled={isUploading}
                    />
                </label>

                <!-- Any File Button -->
                <label class="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 active:scale-95 transition-all cursor-pointer">
                    <Paperclip class="w-4 h-4" />
                    <input
                        type="file"
                        class="hidden"
                        onchange={handleFileUpload}
                        disabled={isUploading}
                    />
                </label>

                <!-- Text Input -->
                <div class="flex-1 relative flex items-center">
                    <input
                        type="text"
                        placeholder={isUploading ? "Subiendo archivo..." : "Escribe una nota rápida..."}
                        bind:value={mobileTextInput}
                        onkeydown={(e) => e.key === "Enter" && sendQuickText()}
                        disabled={isUploading}
                        class="w-full h-10 pl-3.5 pr-10 rounded-full text-xs bg-slate-100/90 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                    <button
                        onclick={sendQuickText}
                        disabled={!mobileTextInput.trim() || isUploading}
                        class="absolute right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none active:scale-90 transition-all shadow-xs"
                    >
                        <ArrowUp class="w-4 h-4 stroke-2" />
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- ============================================== -->
    <!-- FLOATING FILE TRANSFER PROGRESS               -->
    <!-- ============================================== -->
    {#if syncService.transferProgress}
        <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-2xl px-4 py-3 min-w-[280px] max-w-[90vw] flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div class="flex items-center justify-between text-xs">
                <span class="font-semibold truncate max-w-[190px] text-slate-800 dark:text-zinc-200">
                    {syncService.transferProgress.name}
                </span>
                <span class="font-mono text-primary font-bold">
                    {syncService.transferProgress.percent}%
                </span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                    class="bg-primary h-full transition-all duration-150 rounded-full"
                    style="width: {syncService.transferProgress.percent}%"
                ></div>
            </div>
            <span class="text-[10px] text-slate-400 dark:text-zinc-500 text-center">
                Transfiriendo archivo {syncService.p2pStatus === "connected" ? "P2P WebRTC directo" : "por streaming seguro"}...
            </span>
        </div>
    {/if}

    <!-- ============================================== -->
    <!-- DESKTOP ACTION BUTTONS                        -->
    <!-- ============================================== -->
    {#if !isMobile}
        <ActionButtons
            addEmptyText={() => desktopState.addEmptyText()}
            openMobileLink={() => (desktopState.isMobileLinkOpen = true)}
            onSettings={() => (isSettingsOpen = true)}
            bind:hideHeaders={desktopState.hideHeaders}
            bind:bgPattern={desktopState.bgPattern}
        />
        {#if isTauri}
            <PauseButton bind:paused={desktopState.clipboardPaused} />
        {/if}
    {/if}

    <!-- ============================================== -->
    <!-- MODALS & DIALOGS                               -->
    <!-- ============================================== -->
    <SettingsModal
        bind:open={isSettingsOpen}
        bind:hideHeaders={desktopState.hideHeaders}
        bind:hideCardButtons={desktopState.hideCardButtons}
        bind:bgPattern={desktopState.bgPattern}
    />

    <MobileLinkModal
        bind:open={desktopState.isMobileLinkOpen}
        peerId={syncService.roomCode}
    />

    <CardContextMenu {onCopy} {onDelete} {onScanText} />

    <OcrResultModal
        bind:open={desktopState.isOcrModalOpen}
        bind:text={desktopState.ocrText}
        imageSrc={desktopState.ocrImageSrc}
        isLoading={desktopState.ocrLoading}
        onExtract={(rect) => desktopState.handleExtractText(rect)}
        onPinToCanvas={(text) => {
            desktopState.addItem({ type: "text", content: text });
        }}
    />

    <ClearAllAlert
        count={desktopState.items.length}
        onClear={() => (desktopState.items = [])}
    />

    <!-- ============================================== -->
    <!-- SCANNER / VINCULAR MODAL (MOBILE)              -->
    <!-- ============================================== -->
    <Dialog.Root bind:open={isScanModalOpen}>
        <Dialog.Content class="sm:max-w-md w-[92vw] rounded-2xl p-5 border border-slate-200 dark:border-zinc-800">
            <Dialog.Header>
                <Dialog.Title class="text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                    <QrCode class="w-5 h-5 text-primary" />
                    <span>Vincular con tu Computadora</span>
                </Dialog.Title>
                <Dialog.Description class="text-xs text-slate-500 dark:text-zinc-400">
                    Sincroniza tus notas y archivos en tiempo real con la aplicación de escritorio o web.
                </Dialog.Description>
            </Dialog.Header>

            <div class="space-y-4 py-2">
                <!-- Current Status -->
                {#if syncService.status === "connected"}
                    <div class="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-between">
                        <div class="flex items-center gap-2.5">
                            <span class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                            <div>
                                <p class="text-xs font-bold text-green-700 dark:text-green-400">Conectado a la sala</p>
                                <p class="text-xs font-mono font-extrabold text-slate-700 dark:text-zinc-200">{syncService.roomCode}</p>
                            </div>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            class="h-7 text-xs rounded-lg gap-1"
                            onclick={() => {
                                syncService.disconnect();
                                sessionStorage.removeItem("anotapp_room");
                            }}
                        >
                            <Unplug class="w-3.5 h-3.5" />
                            <span>Desconectar</span>
                        </Button>
                    </div>
                {/if}

                <!-- Camera QR Scanner View -->
                {#if isScannerActive}
                    <div class="space-y-3">
                        <ScannerView onScanComplete={handleScanResult} onCancel={() => (isScannerActive = false)} />
                        <Button
                            variant="outline"
                            class="w-full h-9 text-xs rounded-xl"
                            onclick={() => (isScannerActive = false)}
                        >
                            Cerrar escáner de cámara
                        </Button>
                    </div>
                {:else}
                    <Button
                        class="w-full h-11 rounded-xl text-xs font-semibold gap-2 bg-primary text-primary-foreground shadow-xs cursor-pointer"
                        onclick={() => (isScannerActive = true)}
                    >
                        <Camera class="w-4 h-4" />
                        <span>Escanear código QR de la pantalla</span>
                    </Button>
                {/if}

                <div class="relative flex items-center justify-center">
                    <span class="w-full border-t border-slate-200 dark:border-zinc-800"></span>
                    <span class="absolute px-2 text-[10px] uppercase font-bold tracking-wider bg-background text-slate-400 dark:text-zinc-500">
                        O ingresa el código manual
                    </span>
                </div>

                <!-- Manual code form -->
                <form onsubmit={handleConnectManual} class="flex items-center gap-2">
                    <Input
                        type="text"
                        placeholder="Ej: AB12"
                        bind:value={manualCodeInput}
                        maxlength={10}
                        class="h-10 text-center font-mono font-bold uppercase tracking-widest text-sm rounded-xl"
                    />
                    <Button
                        type="submit"
                        disabled={!manualCodeInput.trim()}
                        class="h-10 px-4 rounded-xl text-xs font-semibold"
                    >
                        Conectar
                    </Button>
                </form>

                <!-- Crear sala nueva bajo demanda -->
                {#if syncService.status !== "connected"}
                    <div class="pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                        <Button
                            variant="outline"
                            class="w-full h-9 rounded-xl text-xs gap-1.5 border-dashed"
                            onclick={async () => {
                                try {
                                    await desktopState.registerPeerMapping();
                                    isScanModalOpen = false;
                                } catch (e) {
                                    alert("Error al crear sala: " + e);
                                }
                            }}
                        >
                            <Plus class="w-3.5 h-3.5" />
                            <span>Crear sala en este dispositivo</span>
                        </Button>
                    </div>
                {/if}
            </div>
        </Dialog.Content>
    </Dialog.Root>
</main>

<style>
    :global(html, body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
        width: 100vw;
        height: 100vh;
    }
    :global(.custom-scrollbar::-webkit-scrollbar) {
        width: 4px;
    }
    :global(.custom-scrollbar::-webkit-scrollbar-track) {
        background: transparent;
    }
    :global(.custom-scrollbar::-webkit-scrollbar-thumb) {
        background-color: #3f3f46;
        border-radius: 4px;
    }
    .pb-safe {
        padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
    }
</style>
