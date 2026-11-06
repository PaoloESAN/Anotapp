<script lang="ts">
    import { desktopState } from "../../routes/desktop-state.svelte";
    import { interactionManager } from "../../routes/interaction-manager.svelte";

    let bgSize = $derived(Math.max(8, Math.round(24 * interactionManager.zoom)));
</script>

<div
    class="absolute inset-0 pointer-events-none -z-10 pattern-{desktopState.bgPattern}"
    style="
        background-position: {interactionManager.pan.x}px {interactionManager.pan.y}px;
        background-size: {bgSize}px {bgSize}px;
    "
    aria-hidden="true"
></div>

{#if desktopState.bgPattern === "custom-image" && desktopState.customBgImage}
    <div
        class="absolute inset-0 pointer-events-none -z-20 bg-cover bg-center transition-all duration-700"
        style="background-image: url('{desktopState.customBgImage}')"
    ></div>
{/if}

<div
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 opacity-40 blur-[120px] rounded-full pointer-events-none -z-10"
></div>

<style>
    :global(.pattern-grid) {
        background-image: linear-gradient(
                to right,
                #80808015 1px,
                transparent 1px
            ),
            linear-gradient(to bottom, #80808015 1px, transparent 1px);
    }
    :global(.pattern-dots) {
        background-image: radial-gradient(#80808040 1.5px, transparent 1.5px);
    }
    :global(.pattern-cross) {
        background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l24 24M24 0L0 24' stroke='%23808080' stroke-width='1' fill='none' stroke-opacity='0.15'/%3E%3C/svg%3E");
    }
    :global(.pattern-waves) {
        background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 20c5 0 10-5 20-5s15 5 20 5' stroke='%23808080' stroke-width='1.5' fill='none' stroke-opacity='0.15'/%3E%3Cpath d='M0 40c5 0 10-5 20-5s15 5 20 5' stroke='%23808080' stroke-width='1.5' fill='none' stroke-opacity='0.15'/%3E%3C/svg%3E");
    }
    :global(.pattern-none) {
        background-image: none;
    }
</style>
