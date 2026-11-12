<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import X from "@lucide/svelte/icons/x";

    let imageUrl = $state<string | null>(null);
    let opacity = $state(1);
    let isHovered = $state(false);
    let unlistenImage: (() => void) | null = null;
    let unlistenOpacity: (() => void) | null = null;
    let unlistenMove: (() => void) | null = null;
    let moveSaveTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadMascotImage() {
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            imageUrl = await invoke<string | null>("get_mascot_image");
        } catch (err) {
            console.error("Error loading mascot image:", err);
        }
    }

    onMount(async () => {
        if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
            return;
        }

        const savedOpacity = localStorage.getItem("anotapp-mascot-opacity");
        if (savedOpacity) {
            const parsed = parseFloat(savedOpacity);
            if (!Number.isNaN(parsed)) opacity = Math.min(1, Math.max(0.2, parsed));
        }

        await loadMascotImage();

        try {
            const { listen } = await import("@tauri-apps/api/event");
            const { getCurrentWindow } = await import("@tauri-apps/api/window");

            unlistenImage = await listen("mascot-image-updated", () => {
                loadMascotImage();
            });

            unlistenOpacity = await listen<number>("mascot-opacity-updated", (event) => {
                if (typeof event.payload === "number") {
                    opacity = Math.min(1, Math.max(0.2, event.payload));
                }
            });

            const win = getCurrentWindow();
            unlistenMove = await win.onMoved(({ payload }) => {
                if (moveSaveTimer) clearTimeout(moveSaveTimer);
                moveSaveTimer = setTimeout(async () => {
                    try {
                        const scale = await win.scaleFactor();
                        const logicalX = Math.round(payload.x / scale);
                        const logicalY = Math.round(payload.y / scale);
                        localStorage.setItem(
                            "anotapp-mascot-pos",
                            JSON.stringify({ x: logicalX, y: logicalY }),
                        );
                    } catch {
                        // ignore scale error
                    }
                }, 200);
            });
        } catch (err) {
            console.error("Error setting up mascot listeners:", err);
        }
    });

    onDestroy(() => {
        unlistenImage?.();
        unlistenOpacity?.();
        unlistenMove?.();
        if (moveSaveTimer) clearTimeout(moveSaveTimer);
    });

    async function handlePointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().startDragging();
        } catch (err) {
            console.error("Error dragging mascot window:", err);
        }
    }

    async function handleClose(e: MouseEvent) {
        e.stopPropagation();
        try {
            localStorage.setItem("anotapp-mascot-enabled", "false");
            const { emit } = await import("@tauri-apps/api/event");
            await emit("mascot-closed-by-user");
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("close_mascot_window");
        } catch (err) {
            console.error("Error closing mascot:", err);
        }
    }
</script>

<svelte:head>
    <title>Anotapp Mascot</title>
</svelte:head>

<div
    role="presentation"
    class="w-screen h-screen relative flex items-center justify-center select-none cursor-grab active:cursor-grabbing overflow-hidden bg-transparent"
    onpointerdown={handlePointerDown}
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
>
    {#if imageUrl}
        <img
            src={imageUrl}
            alt="Mascota"
            draggable={false}
            class="w-full h-full object-contain pointer-events-none drop-shadow-md transition-opacity duration-150"
            style="opacity: {opacity};"
        />
    {:else}
        <div
            class="w-24 h-24 rounded-full bg-zinc-900/75 border border-white/20 text-white/80 text-[11px] font-medium flex items-center justify-center text-center p-2 backdrop-blur-md"
        >
            Sin imagen
        </div>
    {/if}

    {#if isHovered}
        <button
            type="button"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={handleClose}
            class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center shadow-md transition-all cursor-pointer backdrop-blur-sm"
            title="Ocultar mascota"
        >
            <X class="w-3.5 h-3.5" />
        </button>
    {/if}
</div>

<style>
    :global(html),
    :global(body) {
        background: transparent !important;
        background-color: transparent !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
    }
</style>
