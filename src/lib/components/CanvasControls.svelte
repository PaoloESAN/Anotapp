<script lang="ts">
    import { interactionManager } from "../../routes/interaction-manager.svelte";
    import Minus from "@lucide/svelte/icons/minus";
    import Plus from "@lucide/svelte/icons/plus";
    import Maximize2 from "@lucide/svelte/icons/maximize-2";
    import MapIcon from "@lucide/svelte/icons/map";

    let zoomPercent = $derived(Math.round(interactionManager.zoom * 100));
</script>

<div
    class="flex items-center gap-1 p-1 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-zinc-800/80 rounded-full shadow-lg ring-1 ring-black/5 dark:ring-white/5 select-none transition-all"
    role="toolbar"
    aria-label="Controles del lienzo"
>
    <!-- Zoom Out -->
    <button
        onclick={() => interactionManager.zoomOut()}
        class="h-8 w-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
        title="Reducir zoom (Zoom Out)"
        aria-label="Reducir zoom"
    >
        <Minus class="w-3.5 h-3.5 stroke-2" />
    </button>

    <!-- Zoom Percent / Reset -->
    <button
        onclick={() => interactionManager.resetZoom()}
        class="h-8 px-2.5 rounded-full flex items-center justify-center text-xs font-mono font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
        title="Restablecer zoom al 100%"
        aria-label="Restablecer zoom al 100%"
    >
        <span>{zoomPercent}%</span>
    </button>

    <!-- Zoom In -->
    <button
        onclick={() => interactionManager.zoomIn()}
        class="h-8 w-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
        title="Aumentar zoom (Zoom In)"
        aria-label="Aumentar zoom"
    >
        <Plus class="w-3.5 h-3.5 stroke-2" />
    </button>

    <div class="h-4 w-px bg-slate-200 dark:bg-zinc-800 mx-0.5" aria-hidden="true"></div>

    <!-- Zoom to Fit Content -->
    <button
        onclick={() => interactionManager.zoomToFit()}
        class="h-8 w-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
        title="Ajustar y centrar todas las notas (Fit)"
        aria-label="Ajustar y centrar notas"
    >
        <Maximize2 class="w-3.5 h-3.5" />
    </button>

    <!-- Toggle Minimap -->
    <button
        onclick={() => {
            interactionManager.showMinimap = !interactionManager.showMinimap;
            interactionManager.saveCanvasState();
        }}
        class="h-8 w-8 rounded-full flex items-center justify-center transition-all {interactionManager.showMinimap ? 'bg-primary/15 text-primary' : 'text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'}"
        title={interactionManager.showMinimap ? "Ocultar minimapa" : "Mostrar minimapa"}
        aria-label="Minimapa"
    >
        <MapIcon class="w-3.5 h-3.5" />
    </button>
</div>
