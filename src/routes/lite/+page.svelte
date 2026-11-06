<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import type { ClipboardItem } from "$lib/types";
    import ClipboardCard from "$lib/components/ClipboardCard.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import ClearAllAlert from "$lib/components/ClearAllAlert.svelte";
    import ActionButtons from "$lib/components/ActionButtons.svelte";
    import MobileLinkModal from "$lib/components/modals/MobileLinkModal.svelte";
    import SettingsModal from "$lib/components/modals/SettingsModal.svelte";
    import OcrResultModal from "$lib/components/modals/OcrResultModal.svelte";
    import CanvasBackground from "$lib/components/CanvasBackground.svelte";
    import WorkspacesBar from "$lib/components/WorkspacesBar.svelte";
    import CardContextMenu from "$lib/components/CardContextMenu.svelte";
    import ScannerView from "$lib/components/ScannerView.svelte";
    import { desktopState } from "../desktop-state.svelte";
    import { interactionManager } from "../interaction-manager.svelte";
    import { syncService } from "$lib/sync-service";

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

    // UI Components
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
    import * as Dialog from "$lib/components/ui/dialog";

    desktopState.initSerialization();

    let isSettingsOpen = $state(false);
    let isMobile = $state(false);
    let mobileViewMode = $state<"cards" | "canvas">("cards");
    let mobileTextInput = $state("");
    let isUploading = $state(false);
    let isScanModalOpen = $state(false);
    let manualCodeInput = $state("");
    let isScannerActive = $state(false);
    let copiedNoteId = $state<string | null>(null);

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
            if (item.type === "text" && item.content) {
                if (navigator.clipboard) {
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

        // Auto-conexión si hay parámetro room o peerId en la URL
        const urlParams = new URLSearchParams(window.location.search);
        let roomParam = urlParams.get("room") || urlParams.get("peerId") || "";

        if (!roomParam && typeof sessionStorage !== "undefined") {
            roomParam = sessionStorage.getItem("anotapp_room") || "";
        }

        try {
            if (roomParam) {
                const upper = roomParam.trim().toUpperCase();
                sessionStorage.setItem("anotapp_room", upper);
                await syncService.connectToRoom(upper);
            } else {
                // Iniciar como host de sala por defecto en Lite
                await desktopState.registerPeerMapping();
            }
        } catch (err) {
            console.error("Error al inicializar conexión con servidor:", err);
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
            // Subir al servidor Elysia para descarga entre diferentes dispositivos
            const uploadRes = await syncService.uploadFile(file);

            if (isImage) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    desktopState.addItem({
                        type: "image",
                        content: dataUrl,
                        name: file.name,
                        downloadUrl: uploadRes.downloadUrl,
                    });
                };
                reader.readAsDataURL(file);
            } else {
                desktopState.addItem({
                    type: "peer-file",
                    content: "",
                    name: file.name,
                    size: file.size,
                    fileId: uploadRes.fileId || crypto.randomUUID(),
                    downloadUrl: uploadRes.downloadUrl,
                });
            }
        } catch (err) {
            console.error("Error al procesar archivo:", err);
            // Fallback para imágenes locales
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
    <title>Anotapp Web Lite</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
</svelte:head>

<svelte:window
    onpointermove={(e) => interactionManager.onPointerMove(e)}
    onpointerup={(e) => interactionManager.onPointerUp(e)}
    onresize={() => interactionManager.onWindowResize()}
/>

<main
    class="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 relative font-sans isolate selection:bg-primary/30 transition-colors duration-500 flex flex-col"
>
    <!-- Background visual canvas -->
    <CanvasBackground />

    <!-- ============================================== -->
    <!-- TOP BAR (RESPONSIVE: DESKTOP & MOBILE)        -->
    <!-- ============================================== -->
    <header class="h-14 w-full flex items-center justify-between px-3 sm:px-6 z-50 backdrop-blur-md bg-white/40 dark:bg-zinc-950/40 border-b border-slate-200/50 dark:border-zinc-800/50 shrink-0">
        <!-- Logo / App Name -->
        <div class="flex items-center gap-2">
            <span class="font-bold tracking-tight text-lg text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                <span>Anotapp</span>
                <span class="text-[11px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">Lite</span>
            </span>
        </div>

        <!-- Center / Workspace Switcher (Mobile & Compact) -->
        <div class="flex items-center gap-1 sm:gap-2">
            {#if isMobile}
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
            {/if}

            <!-- Connection Status Badge / Vincular Button -->
            {#if syncService.status === "connected" && syncService.roomCode}
                <button
                    onclick={() => (isMobile ? (isScanModalOpen = true) : (desktopState.isMobileLinkOpen = true))}
                    class="h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-all cursor-pointer shadow-xs"
                    title="Sala activa. Haz clic para ver detalles"
                >
                    <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span class="font-mono tracking-wider">{syncService.roomCode}</span>
                    {#if syncService.deviceCount > 1}
                        <span class="text-[10px] bg-green-500/20 px-1 rounded-sm ml-0.5">{syncService.deviceCount}</span>
                    {/if}
                </button>
            {:else if syncService.status === "connecting" || syncService.status === "reconnecting"}
                <div class="h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Loader2 class="w-3.5 h-3.5 animate-spin" />
                    <span>Conectando...</span>
                </div>
            {:else}
                <Button
                    variant="outline"
                    size="sm"
                    class="h-8 rounded-full text-xs gap-1.5 bg-background/60"
                    onclick={() => (isMobile ? (isScanModalOpen = true) : (desktopState.isMobileLinkOpen = true))}
                >
                    <QrCode class="w-3.5 h-3.5 text-primary" />
                    <span>Vincular</span>
                </Button>
            {/if}
        </div>

        <!-- Right Controls: View Switcher (Mobile) & Settings -->
        <div class="flex items-center gap-1">
            {#if isMobile}
                <!-- Toggle View Mode between Cards Feed and Canvas -->
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 rounded-full"
                    title={mobileViewMode === "cards" ? "Ver Lienzo" : "Ver Lista"}
                    onclick={() => (mobileViewMode = mobileViewMode === "cards" ? "canvas" : "cards")}
                >
                    {#if mobileViewMode === "cards"}
                        <LayoutGrid class="w-4 h-4 text-slate-600 dark:text-zinc-300" />
                    {:else}
                        <List class="w-4 h-4 text-slate-600 dark:text-zinc-300" />
                    {/if}
                </Button>
            {/if}

            <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 rounded-full"
                title="Configuración"
                onclick={() => (isSettingsOpen = true)}
            >
                <Settings class="w-4 h-4 text-slate-600 dark:text-zinc-300" />
            </Button>
        </div>
    </header>

    <!-- ============================================== -->
    <!-- CONTENT AREA                                   -->
    <!-- ============================================== -->
    <div class="flex-1 relative overflow-hidden flex flex-col">
        <!-- VISTA MÓVIL: MODO TARJETAS (CARDS FEED) -->
        {#if isMobile && mobileViewMode === "cards"}
            <div class="flex-1 overflow-y-auto px-4 py-4 pb-28 custom-scrollbar space-y-3 max-w-xl mx-auto w-full">
                {#if desktopState.items.length === 0}
                    <div class="flex flex-col items-center justify-center min-h-[300px] text-center px-4 gap-3">
                        <div class="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                            <Pen class="w-6 h-6" />
                        </div>
                        <div>
                            <h3 class="font-semibold text-base">Mesa vacía</h3>
                            <p class="text-xs text-muted-foreground mt-1 max-w-xs">
                                Escribe una nota abajo o sube una foto para empezar a organizar tu contenido sincronizado.
                            </p>
                        </div>
                    </div>
                {:else}
                    {#each desktopState.items as item (item.id)}
                        <div class="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-2xl p-4 border border-slate-200/60 dark:border-zinc-800/60 shadow-xs flex flex-col gap-3 transition-all">
                            <!-- Card Header -->
                            <div class="flex items-center justify-between text-xs text-muted-foreground border-b border-border/40 pb-2">
                                <span class="font-medium uppercase tracking-wider text-[10px] text-primary">
                                    {item.type === "text" ? "Texto" : item.type === "image" ? "Imagen" : "Archivo"}
                                </span>
                                <div class="flex items-center gap-1">
                                    {#if item.type === "image"}
                                        <button
                                            onclick={() => onScanText(item)}
                                            class="p-1 hover:bg-primary/10 rounded-md text-primary transition-colors"
                                            title="Extraer Texto (OCR)"
                                        >
                                            <ScanText class="w-4 h-4" />
                                        </button>
                                    {/if}
                                    {#if item.type === "peer-file" || item.downloadUrl}
                                        <button
                                            onclick={() => {
                                                if (item.fileId) desktopState.requestFile(item.fileId);
                                                else if (item.downloadUrl) {
                                                    const a = document.createElement("a");
                                                    a.href = item.downloadUrl;
                                                    a.download = item.name || "descarga";
                                                    a.target = "_blank";
                                                    a.click();
                                                }
                                            }}
                                            class="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md transition-colors"
                                            title="Descargar"
                                        >
                                            <Download class="w-4 h-4" />
                                        </button>
                                    {/if}
                                    <button
                                        onclick={() => onCopy(item)}
                                        class="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md transition-colors"
                                        title="Copiar"
                                    >
                                        {#if copiedNoteId === item.id}
                                            <Check class="w-4 h-4 text-green-500" />
                                        {:else}
                                            <Copy class="w-4 h-4" />
                                        {/if}
                                    </button>
                                    <button
                                        onclick={() => onDelete(item.id)}
                                        class="p-1 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors ml-1"
                                        title="Eliminar"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <!-- Card Body -->
                            {#if item.type === "text"}
                                <div class="text-sm font-sans whitespace-pre-wrap break-words leading-relaxed select-text">
                                    {item.content}
                                </div>
                            {:else if item.type === "image"}
                                <div class="rounded-xl overflow-hidden bg-black/5 dark:bg-black/40 flex justify-center max-h-[300px]">
                                    <img
                                        src={item.content}
                                        alt={item.name || "Imagen"}
                                        class="object-contain w-full h-full max-h-[300px]"
                                    />
                                </div>
                            {:else if item.type === "peer-file" || item.type === "files"}
                                <div class="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                                    <div class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                        <FileIcon class="w-5 h-5" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs font-semibold truncate">{item.name || "Archivo"}</p>
                                        {#if item.size}
                                            <p class="text-[11px] text-muted-foreground">
                                                {(item.size / 1024).toFixed(1)} KB
                                            </p>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>
        {:else}
            <!-- VISTA LIENZO (CANVAS DESKTOP & MOBILE LIENZO) -->
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

            {#if !isMobile}
                <!-- Controles flotantes en modo escritorio -->
                <ActionButtons
                    addEmptyText={() => desktopState.addEmptyText()}
                    openMobileLink={() => (desktopState.isMobileLinkOpen = true)}
                    onSettings={() => (isSettingsOpen = true)}
                    bind:hideHeaders={desktopState.hideHeaders}
                    bind:bgPattern={desktopState.bgPattern}
                />

                <WorkspacesBar />
            {/if}
        {/if}
    </div>

    <!-- ============================================== -->
    <!-- BARRA DE ACCIÓN RÁPIDA / CHAT (MÓVIL)          -->
    <!-- ============================================== -->
    {#if isMobile}
        <div class="fixed bottom-0 left-0 right-0 p-3 z-50 bg-background/80 backdrop-blur-xl border-t border-border/50 max-w-xl mx-auto w-full">
            {#if isUploading}
                <div class="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-lg mb-2 animate-in fade-in">
                    <Loader2 class="w-3.5 h-3.5 animate-spin" />
                    <span>Subiendo y sincronizando archivo...</span>
                </div>
            {/if}

            <div class="flex items-center gap-2 bg-muted/60 dark:bg-zinc-900 rounded-2xl p-1.5 border border-border/60 shadow-xs">
                <!-- Dropdown de adjuntos (Foto, Galería, Archivo) -->
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant="ghost"
                                size="icon"
                                class="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
                            >
                                <Paperclip class="w-4 h-4" />
                            </Button>
                        {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start" side="top" class="w-48 mb-2 rounded-xl">
                        <DropdownMenu.Item
                            onclick={() => document.getElementById("mobile-camera-capture")?.click()}
                            class="cursor-pointer gap-2 py-2"
                        >
                            <Camera class="w-4 h-4 text-primary" />
                            <span>Tomar Foto</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onclick={() => document.getElementById("mobile-image-upload")?.click()}
                            class="cursor-pointer gap-2 py-2"
                        >
                            <ImagePlus class="w-4 h-4 text-primary" />
                            <span>Subir de Galería</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onclick={() => document.getElementById("mobile-file-upload")?.click()}
                            class="cursor-pointer gap-2 py-2"
                        >
                            <FileIcon class="w-4 h-4 text-primary" />
                            <span>Subir Archivo</span>
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>

                <!-- Input de texto -->
                <input
                    type="text"
                    bind:value={mobileTextInput}
                    placeholder="Escribe una nota rápida..."
                    class="flex-1 bg-transparent border-0 text-sm outline-none px-2 py-1 placeholder:text-muted-foreground/60"
                    onkeydown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            sendQuickText();
                        }
                    }}
                />

                <!-- Botón de enviar -->
                <Button
                    size="icon"
                    onclick={sendQuickText}
                    disabled={!mobileTextInput.trim()}
                    class="h-9 w-9 rounded-xl shrink-0 bg-primary text-primary-foreground disabled:opacity-40 transition-all shadow-xs"
                >
                    <ArrowUp class="w-4 h-4" />
                </Button>
            </div>
        </div>
    {/if}

    <!-- Inputs ocultos para subida de archivos móvil -->
    <input
        type="file"
        id="mobile-camera-capture"
        accept="image/*"
        capture="environment"
        class="hidden"
        onchange={handleFileUpload}
    />
    <input
        type="file"
        id="mobile-image-upload"
        accept="image/*"
        class="hidden"
        onchange={handleFileUpload}
    />
    <input
        type="file"
        id="mobile-file-upload"
        class="hidden"
        onchange={handleFileUpload}
    />

    <!-- ============================================== -->
    <!-- MODAL DE ESCANEO / VINCULACIÓN EN MÓVIL         -->
    <!-- ============================================== -->
    <Dialog.Root bind:open={isScanModalOpen}>
        <Dialog.Content class="sm:max-w-md w-[95vw] rounded-2xl p-6 bg-background">
            <Dialog.Header class="text-center">
                <Dialog.Title class="text-lg font-bold">Vincular con PC</Dialog.Title>
                <Dialog.Description class="text-xs text-muted-foreground">
                    Conéctate al lienzo de tu computadora mediante QR o código.
                </Dialog.Description>
            </Dialog.Header>

            {#if isScannerActive}
                <div class="mt-2">
                    <ScannerView
                        onScanComplete={handleScanResult}
                        onCancel={() => (isScannerActive = false)}
                    />
                </div>
            {:else}
                <div class="space-y-4 pt-2">
                    <Button
                        size="lg"
                        class="w-full h-12 rounded-xl gap-2 font-semibold"
                        onclick={() => (isScannerActive = true)}
                    >
                        <Camera class="w-5 h-5" />
                        <span>Escanear código QR</span>
                    </Button>

                    <div class="relative flex items-center justify-center my-2">
                        <div class="absolute inset-0 flex items-center">
                            <span class="w-full border-t border-muted"></span>
                        </div>
                        <span class="relative bg-background px-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                            O escribe el código
                        </span>
                    </div>

                    <form onsubmit={handleConnectManual} class="space-y-3">
                        <Input
                            type="text"
                            bind:value={manualCodeInput}
                            placeholder="Ej: SW9LQR"
                            class="text-center font-mono font-bold tracking-widest uppercase h-11 rounded-xl text-base"
                        />
                        <Button
                            type="submit"
                            variant="secondary"
                            class="w-full h-11 rounded-xl font-bold"
                            disabled={!manualCodeInput.trim()}
                        >
                            Conectar a Sala
                        </Button>
                    </form>

                    {#if syncService.roomCode}
                        <div class="pt-3 border-t border-border/50 text-center">
                            <p class="text-[11px] text-muted-foreground">Tu código actual:</p>
                            <span class="font-mono font-bold tracking-widest text-sm text-primary">
                                {syncService.roomCode}
                            </span>
                        </div>
                    {/if}
                </div>
            {/if}
        </Dialog.Content>
    </Dialog.Root>

    <!-- Modales de escritorio compartidos -->
    <SettingsModal
        bind:open={isSettingsOpen}
        bind:hideHeaders={desktopState.hideHeaders}
        bind:hideCardButtons={desktopState.hideCardButtons}
        bind:bgPattern={desktopState.bgPattern}
    />

    <MobileLinkModal
        bind:open={desktopState.isMobileLinkOpen}
        peerId={desktopState.peerId}
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
</main>

<style>
    :global(html, body) {
        margin: 0;
        padding: 0;
        background: #09090b;
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
</style>
