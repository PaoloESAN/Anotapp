<script lang="ts">
    import { onMount } from "svelte";

    onMount(() => {
        if (typeof window !== "undefined") {
            const search = window.location.search || "";
            window.location.replace(`/${search}`);
        }
    });
</script>

<div class="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 text-slate-500 text-sm">
    <span>Redirigiendo a Anotapp...</span>
</div>
