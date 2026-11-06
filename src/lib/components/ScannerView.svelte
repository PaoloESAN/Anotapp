<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import jsQR from "jsqr";

    let { onScanComplete, onCancel } = $props<{ 
        onScanComplete: (result: string) => void,
        onCancel: () => void
    }>();

    let videoElement: HTMLVideoElement | null = $state(null);
    let canvasElement: HTMLCanvasElement | null = $state(null);
    let scanStream: MediaStream | null = $state(null);
    let isScanning = $state(true);
    let cameraError = $state<string | null>(null);

    onMount(async () => {
        try {
            scanStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });

            if (videoElement) {
                videoElement.srcObject = scanStream;
                videoElement.setAttribute("playsinline", "true");
                await videoElement.play();
                requestAnimationFrame(tick);
            }
        } catch (err: any) {
            console.error("Error accessing camera:", err);
            cameraError = "No se pudo acceder a la cámara. Asegúrate de otorgar permisos.";
        }
    });

    onDestroy(() => {
        stopScanner();
    });

    function stopScanner() {
        isScanning = false;
        if (scanStream) {
            scanStream.getTracks().forEach((track) => track.stop());
            scanStream = null;
        }
    }

    function tick() {
        if (!isScanning || !videoElement || !canvasElement) return;

        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            canvasElement.height = videoElement.videoHeight;
            canvasElement.width = videoElement.videoWidth;
            const ctx = canvasElement.getContext("2d", { willReadFrequently: true });
            if (ctx) {
                ctx.drawImage(
                    videoElement,
                    0,
                    0,
                    canvasElement.width,
                    canvasElement.height,
                );
                const imageData = ctx.getImageData(
                    0,
                    0,
                    canvasElement.width,
                    canvasElement.height,
                );
                const code = jsQR(
                    imageData.data,
                    imageData.width,
                    imageData.height,
                    { inversionAttempts: "dontInvert" },
                );
                if (code && code.data) {
                    stopScanner();
                    onScanComplete(code.data);
                    return;
                }
            }
        }
        if (isScanning) {
            requestAnimationFrame(tick);
        }
    }
</script>

<div class="relative w-full aspect-4/3 max-h-64 sm:max-h-72 rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-slate-200/50 dark:border-zinc-800/80 shadow-inner">
    {#if cameraError}
        <div class="p-6 text-center text-xs text-rose-400">
            <p class="font-medium">{cameraError}</p>
        </div>
    {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoElement} class="w-full h-full object-cover"></video>
        <canvas bind:this={canvasElement} class="hidden"></canvas>

        <!-- Centered Target Reticle -->
        <div class="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
            <div class="w-40 h-40 border-2 border-primary/40 rounded-2xl relative flex items-center justify-center">
                <div class="absolute -top-1 -left-1 w-5 h-5 border-t-3 border-l-3 border-primary rounded-tl-lg"></div>
                <div class="absolute -top-1 -right-1 w-5 h-5 border-t-3 border-r-3 border-primary rounded-tr-lg"></div>
                <div class="absolute -bottom-1 -left-1 w-5 h-5 border-b-3 border-l-3 border-primary rounded-bl-lg"></div>
                <div class="absolute -bottom-1 -right-1 w-5 h-5 border-b-3 border-r-3 border-primary rounded-br-lg"></div>
                <!-- Scanning bar -->
                <div class="w-full h-0.5 bg-primary absolute top-0 left-0 shadow-[0_0_10px_2px_rgba(var(--primary),0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
        </div>

        <div class="absolute bottom-2.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[11px] text-white/90 font-medium tracking-wide">
            Apunta la cámara al código QR
        </div>
    {/if}
</div>

<style>
    @keyframes scan {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(160px); }
    }
</style>
