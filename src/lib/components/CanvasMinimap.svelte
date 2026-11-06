<script lang="ts">
    import { desktopState } from "../../routes/desktop-state.svelte";
    import { interactionManager } from "../../routes/interaction-manager.svelte";
    import X from "@lucide/svelte/icons/x";
    import MapPin from "@lucide/svelte/icons/map-pin";

    const minimapW = 160;
    const minimapH = 100;

    let items = $derived(desktopState.items);
    let pan = $derived(interactionManager.pan);
    let zoom = $derived(interactionManager.zoom);

    // Viewport in canvas coordinate space
    let screenW = $state(typeof window !== "undefined" ? window.innerWidth : 1200);
    let screenH = $state(typeof window !== "undefined" ? window.innerHeight : 800);

    let vpLeft = $derived(-pan.x / zoom);
    let vpTop = $derived(-pan.y / zoom);
    let vpWidth = $derived(screenW / zoom);
    let vpHeight = $derived(screenH / zoom);
    let vpRight = $derived(vpLeft + vpWidth);
    let vpBottom = $derived(vpTop + vpHeight);

    // Compute bounding box enclosing items + viewport + margin
    let bounds = $derived.by(() => {
        let minX = vpLeft;
        let minY = vpTop;
        let maxX = vpRight;
        let maxY = vpBottom;

        for (const item of items) {
            const w = item.w || 280;
            const h = item.h || 160;
            minX = Math.min(minX, item.x);
            minY = Math.min(minY, item.y);
            maxX = Math.max(maxX, item.x + w);
            maxY = Math.max(maxY, item.y + h);
        }

        const margin = 200;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        const totalW = Math.max(400, maxX - minX);
        const totalH = Math.max(300, maxY - minY);
        const scale = Math.min(minimapW / totalW, minimapH / totalH);

        return { minX, minY, totalW, totalH, scale };
    });

    let miniViewport = $derived({
        x: Math.max(0, (vpLeft - bounds.minX) * bounds.scale),
        y: Math.max(0, (vpTop - bounds.minY) * bounds.scale),
        w: Math.min(minimapW, vpWidth * bounds.scale),
        h: Math.min(minimapH, vpHeight * bounds.scale),
    });

    function handleMinimapNav(e: MouseEvent | PointerEvent) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const targetCanvasX = bounds.minX + clickX / bounds.scale;
        const targetCanvasY = bounds.minY + clickY / bounds.scale;

        interactionManager.centerOnPoint(targetCanvasX, targetCanvasY);
    }
</script>

<svelte:window
    onresize={() => {
        screenW = window.innerWidth;
        screenH = window.innerHeight;
    }}
/>

<div
    class="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 select-none ring-1 ring-black/5 dark:ring-white/5 transition-all w-[184px]"
>
    <!-- Minimap Header -->
    <div class="flex items-center justify-between px-1 text-slate-500 dark:text-zinc-400">
        <div class="flex items-center gap-1.5 text-xs font-semibold">
            <MapPin class="w-3.5 h-3.5 text-primary" />
            <span class="text-slate-700 dark:text-zinc-300">Minimapa</span>
            <span class="text-[10px] bg-slate-200/60 dark:bg-zinc-800/60 px-1.5 py-0.2 rounded-full font-mono">
                {items.length}
            </span>
        </div>
        <button
            onclick={() => {
                interactionManager.showMinimap = false;
                interactionManager.saveCanvasState();
            }}
            class="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
            title="Cerrar minimapa"
        >
            <X class="w-3.5 h-3.5" />
        </button>
    </div>

    <!-- Minimap Radar Box -->
    <div
        role="presentation"
        onclick={handleMinimapNav}
        onpointerdown={(e) => {
            const el = e.currentTarget as HTMLElement;
            try { el.setPointerCapture(e.pointerId); } catch {}
            handleMinimapNav(e);
        }}
        onpointermove={(e) => {
            if (e.buttons === 1) handleMinimapNav(e);
        }}
        class="w-[160px] h-[100px] bg-slate-100/90 dark:bg-zinc-950/90 rounded-xl relative overflow-hidden border border-slate-200/60 dark:border-zinc-800/60 cursor-crosshair shadow-inner"
    >
        <!-- Cards representation -->
        {#each items as item (item.id)}
            {@const mx = (item.x - bounds.minX) * bounds.scale}
            {@const my = (item.y - bounds.minY) * bounds.scale}
            {@const mw = Math.max(3, (item.w || 280) * bounds.scale)}
            {@const mh = Math.max(2, (item.h || 160) * bounds.scale)}
            <div
                class="absolute rounded-xs bg-primary/70 border border-primary pointer-events-none transition-all"
                style="left: {mx}px; top: {my}px; width: {mw}px; height: {mh}px;"
            ></div>
        {/each}

        <!-- Viewport Camera Frustum Frame -->
        <div
            class="absolute rounded-sm border-2 border-primary bg-primary/20 shadow-xs pointer-events-none transition-all duration-75"
            style="
                left: {miniViewport.x}px;
                top: {miniViewport.y}px;
                width: {miniViewport.w}px;
                height: {miniViewport.h}px;
            "
        ></div>
    </div>
</div>
