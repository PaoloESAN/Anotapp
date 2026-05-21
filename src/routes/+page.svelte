<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import {
        startListening,
        onTextUpdate,
        onImageUpdate,
        onFilesUpdate,
    } from "tauri-plugin-clipboard-api";
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
    import WorkspacesBar from "$lib/components/WorkspacesBar.svelte";
    import CardContextMenu from "$lib/components/CardContextMenu.svelte";
    import type { DataConnection } from "peerjs";
    import { desktopState } from "./desktop-state.svelte";
    import { interactionManager } from "./interaction-manager.svelte";

    desktopState.initSerialization();

    let isSettingsOpen = $state(false);

    let stopListening: (() => Promise<void>) | null = null;

    function onDelete(id: string) {
        desktopState.deleteItem(id);
    }

    function onScanText(item: ClipboardItem) {
        if (item.type !== "image" || !item.content) return;
        desktopState.ocrImageSrc = item.content;
        desktopState.ocrText = "";
        desktopState.isOcrModalOpen = true;
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

    onMount(async () => {
        window.addEventListener("contextmenu", handleGlobalContextMenu, {
            capture: true,
        });
        window.addEventListener("anotapp-bg-updated", ((e: CustomEvent) => {
            desktopState.customBgImage = e.detail;
        }) as EventListener);

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

        // Initialize PeerJS
        try {
            const { Peer } = await import("peerjs");

            const initPeer = () => {
                // Dejar que PeerJS genere el UUID seguro largo
                desktopState.peerInstance = new Peer();

                desktopState.peerInstance.on("open", async (uuid: string) => {
                    try {
                        const shortCode = await desktopState.registerPeerMapping(uuid);
                        desktopState.peerId = shortCode;
                    } catch (e) {
                        console.error("Error al registrar código de vinculación:", e);
                        desktopState.peerId = "ERROR";
                    }
                });

                desktopState.peerInstance.on(
                    "connection",
                    (conn: DataConnection) => {
                        // Limitar a 10 dispositivos máximo (sin contar esta PC)
                        if (desktopState.clientConnections.length >= 10) {
                            conn.on("open", () => {
                                conn.send({
                                    type: "error",
                                    message:
                                        "Límite de dispositivos alcanzado (10 max).",
                                });
                                setTimeout(() => conn.close(), 500);
                            });
                            return;
                        }

                        desktopState.isMobileLinkOpen = false;

                        conn.on("open", () => {
                            desktopState.clientConnections.push(conn);
                            // Sincronizar el estado actual al nuevo cliente
                            conn.send({
                                type: "sync-state",
                                items: desktopState.items,
                            });
                        });

                        conn.on("data", (data: any) => {
                            desktopState.handleIncomingPeerData(data, conn);
                        });

                        conn.on("close", () => {
                            desktopState.clientConnections =
                                desktopState.clientConnections.filter(
                                    (c) => c !== conn,
                                );
                        });

                        conn.on("error", () => {
                            desktopState.clientConnections =
                                desktopState.clientConnections.filter(
                                    (c) => c !== conn,
                                );
                        });
                    },
                );

                desktopState.peerInstance.on("error", (err: any) => {
                    console.error("PeerJS error:", err);
                });
            };

            initPeer();
        } catch (err) {
            console.error("Failed to initialize PeerJS:", err);
        }

        setTimeout(() => (desktopState.isReady = true), 300);
    });

    onDestroy(async () => {
        window.removeEventListener("contextmenu", handleGlobalContextMenu, {
            capture: true,
        });
        if (stopListening) await stopListening();
        if (desktopState.peerInstance) desktopState.peerInstance.destroy();
    });

    async function onCopy(item: ClipboardItem) {
        try {
            if (item.type === "text") {
                const { writeText } = await import(
                    "tauri-plugin-clipboard-api"
                );
                await writeText(item.content);
                desktopState.lastText = item.content;
            } else if (item.type === "image") {
                const { writeImageBase64 } = await import(
                    "tauri-plugin-clipboard-api"
                );
                const b64 = item.content.replace(/^data:[^;]+;base64,/, "");
                await writeImageBase64(b64);
            } else if (item.type === "files" && item.files?.length) {
                const { writeFilesURIs } = await import(
                    "tauri-plugin-clipboard-api"
                );
                await writeFilesURIs(item.files);
            }
        } catch (err) {
            console.log(err);
        }
    }
</script>

<svelte:window
    onpointermove={(e) => interactionManager.onPointerMove(e)}
    onpointerup={(e) => interactionManager.onPointerUp(e)}
    onresize={() => interactionManager.onWindowResize()}
/>

<main
    class="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 relative font-sans isolate selection:bg-primary/30 transition-colors duration-500"
>
    <CanvasBackground />

    {#if desktopState.hostConnection}
        <div
            class="absolute top-6 left-1/2 -translate-x-1/2 z-100 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 backdrop-blur-md shadow-sm select-none pointer-events-none transition-all"
        >
            <span
                class="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"
            ></span>
            Conectado a:
            <span
                class="font-mono tracking-widest text-green-700 dark:text-green-300"
                >{desktopState.connectedHostCode}</span
            >
        </div>
    {/if}

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

    <Titlebar />

    <SettingsModal
        bind:open={isSettingsOpen}
        bind:hideHeaders={desktopState.hideHeaders}
        bind:hideCardButtons={desktopState.hideCardButtons}
        bind:bgPattern={desktopState.bgPattern}
    />

    <ActionButtons
        addEmptyText={() => desktopState.addEmptyText()}
        openMobileLink={() => (desktopState.isMobileLinkOpen = true)}
        onSettings={() => (isSettingsOpen = true)}
        bind:hideHeaders={desktopState.hideHeaders}
        bind:bgPattern={desktopState.bgPattern}
    />

    <MobileLinkModal
        bind:open={desktopState.isMobileLinkOpen}
        peerId={desktopState.hostConnection ? desktopState.connectedHostCode : desktopState.peerId}
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

    <PauseButton bind:paused={desktopState.clipboardPaused} />

    <WorkspacesBar />

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
