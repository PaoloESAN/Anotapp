<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import jsQR from "jsqr";
    import Camera from "@lucide/svelte/icons/camera";
    import X from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button";
    import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "$lib/components/ui/card";

    let { onScanComplete, onCancel } = $props<{ 
        onScanComplete: (result: string) => void,
        onCancel: () => void
    }>();

    let videoElement: HTMLVideoElement | null = $state(null);
    let canvasElement: HTMLCanvasElement | null = $state(null);
    let scanStream: MediaStream | null = $state(null);
    let isScanning = $state(true);

    onMount(async () => {
        try {
            scanStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });

            if (videoElement) {
                videoElement.srcObject = scanStream;
                videoElement.setAttribute("playsinline", "true");
                videoElement.play();
                requestAnimationFrame(tick);
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("No se pudo acceder a la cámara.");
            onCancel();
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
            const ctx = canvasElement.getContext("2d");
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
                if (code) {
                    stopScanner();
                    onScanComplete(code.data);
                }
            }
        }
        if (isScanning) {
            requestAnimationFrame(tick);
        }
    }
</script>

<Card class="overflow-hidden animate-in fade-in zoom-in-95 duration-300">
    <CardHeader class="flex flex-row items-center justify-between bg-muted/30 pb-4 border-b">
        <CardTitle class="flex items-center gap-2 text-base m-0">
            <Camera class="w-4 h-4 text-primary" />
            Escanear QR
        </CardTitle>
        <Button
            variant="ghost"
            size="icon"
            class="w-8 h-8 rounded-full"
            onclick={onCancel}
        >
            <X class="w-4 h-4" />
        </Button>
    </CardHeader>
    <CardContent class="p-0 relative bg-black aspect-4/3 w-full flex items-center justify-center">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoElement} class="w-full h-full object-cover"></video>
        <canvas bind:this={canvasElement} class="hidden"></canvas>

        <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div class="w-48 h-48 border-2 border-primary/50 rounded-xl relative">
                <div class="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                <div class="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                <div class="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                <div class="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                <div class="w-full h-0.5 bg-primary absolute top-0 left-0 shadow-[0_0_8px_2px_rgba(var(--primary),0.5)] animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
        </div>
    </CardContent>
    <CardFooter class="p-4 flex-col text-center text-sm text-muted-foreground bg-muted/10">
        Apunta la cámara al código QR de la aplicación de escritorio
    </CardFooter>
</Card>

<style>
    @keyframes scan {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(192px); }
    }
</style>
