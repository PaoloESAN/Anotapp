<script lang="ts">
    import { onMount } from "svelte";

    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        const room = params.get("room") || params.get("peerId") || "";
        const target = room
            ? `/lite?room=${encodeURIComponent(room)}&peerId=${encodeURIComponent(room)}`
            : "/lite";
        window.location.replace(target);
    });
</script>

<svelte:head>
    <title>Redirigiendo a Anotapp Lite...</title>
</svelte:head>

<div class="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
    <div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
    <p class="text-sm text-muted-foreground font-medium">Redirigiendo a Anotapp Lite...</p>
</div>
