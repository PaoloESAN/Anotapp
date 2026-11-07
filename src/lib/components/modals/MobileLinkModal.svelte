<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import QRCode from "qrcode";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import Link from "@lucide/svelte/icons/link";
    import Unplug from "@lucide/svelte/icons/unplug";
    import Share2 from "@lucide/svelte/icons/share-2";
    import Loader2 from "@lucide/svelte/icons/loader-2";
    import QrCode from "@lucide/svelte/icons/qr-code";
    import { desktopState } from "../../../routes/desktop-state.svelte";
    import { syncService } from "$lib/sync-service.svelte";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    let {
        open = $bindable(false),
        peerId = "",
    }: { open: boolean; peerId: string } = $props();

    let canvasConnected = $state<HTMLCanvasElement>();
    let canvasStandalone = $state<HTMLCanvasElement>();
    let copied = $state(false);
    let targetPeerId = $state("");
    let isStartingHost = $state(false);

    function getLiteUrl() {
        const envLite = (import.meta.env.PUBLIC_LITE_URL as string) || (import.meta.env.PUBLIC_MOBILE_URL as string);
        if (envLite) return envLite.replace(/\/lite\/?$/, "");
        if (typeof window !== "undefined") {
            return window.location.origin;
        }
        return "https://anotapp-web.vercel.app";
    }

    async function handleStartSharing() {
        if (isStartingHost) return;
        isStartingHost = true;
        try {
            await desktopState.registerPeerMapping();
        } finally {
            isStartingHost = false;
        }
    }

    $effect(() => {
        const activeCanvas = desktopState.hostConnection ? canvasConnected : canvasStandalone;
        const currentCode = peerId || syncService.roomCode;
        if (open && activeCanvas && currentCode && syncService.status === "connected") {
            const baseUrl = getLiteUrl();
            const sep = baseUrl.includes("?") ? "&" : "?";
            const url = `${baseUrl}${sep}room=${currentCode}&peerId=${currentCode}`;

            QRCode.toCanvas(
                activeCanvas,
                url,
                {
                    width: 200,
                    margin: 1,
                    color: {
                        dark: "#000000FF",
                        light: "#FFFFFFFF",
                    },
                },
                function (error) {
                    if (error) console.error(error);
                },
            );
        }
    });

    function copyPeerId() {
        const code = peerId || syncService.roomCode;
        if (code) {
            navigator.clipboard.writeText(code);
            copied = true;
            setTimeout(() => {
                copied = false;
            }, 2000);
        }
    }

    function connectToPC() {
        if (targetPeerId.trim() === "") return;
        desktopState.connectToHost(targetPeerId.trim());
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content
        class="sm:max-w-md w-[95vw] bg-background border-border text-foreground p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4"
    >
        <Dialog.Header class="text-center">
            <Dialog.Title
                class="text-xl font-bold tracking-tight text-foreground"
            >
                Vincular Dispositivos
            </Dialog.Title>
            <Dialog.Description class="text-muted-foreground">
                Conecta tu celular u otros PCs a este lienzo.
            </Dialog.Description>
        </Dialog.Header>

        {#if desktopState.hostConnection}
            <div class="space-y-6 flex flex-col items-center">
                <!-- Conectado a -->
                <div class="w-full space-y-3">
                    <h4 class="text-sm font-semibold text-foreground">
                        Conectado a:
                    </h4>
                    <div
                        class="flex items-center justify-between bg-muted/50 p-2.5 rounded-[1.25rem] border border-border/40"
                    >
                        <div class="flex items-center gap-2">
                            <div
                                class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                            ></div>
                            <span
                                class="text-sm font-mono font-bold tracking-widest text-foreground"
                                >{desktopState.connectedHostCode}
                                <span
                                    class="text-xs text-muted-foreground font-sans tracking-normal font-normal ml-1"
                                    >(Anfitrión)</span
                                ></span
                            >
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            title="Desconectar"
                            class="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-full shrink-0"
                            onclick={() => {
                                syncService.disconnect();
                            }}
                        >
                            <Unplug class="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div class="w-full border-t border-border/60 my-2"></div>

                <!-- QR code para vincular celular directamente al host -->
                <div
                    class="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 flex items-center justify-center animate-in fade-in duration-300"
                >
                    <canvas
                        bind:this={canvasConnected}
                        class="block max-w-full h-auto rounded-md"
                    ></canvas>
                </div>

                {#if peerId || syncService.roomCode}
                    <div class="text-center w-full">
                        <p
                            class="text-xs text-muted-foreground uppercase tracking-wider font-semibold"
                        >
                            ID de Conexión Compartida
                        </p>
                        <p
                            class="font-mono bg-muted px-5 py-2.5 rounded-full text-sm mt-1.5 select-all inline-block font-bold tracking-widest text-foreground border border-border/30 animate-in fade-in duration-300"
                        >
                            {peerId || syncService.roomCode}
                        </p>
                    </div>
                {/if}
                <p class="text-xs text-center text-muted-foreground max-w-xs leading-relaxed">
                    Escanea el código para enviar texto e imágenes desde tu celular directamente al anfitrión de este lienzo.
                </p>
            </div>
        {:else}
            <Tabs.Root value="vincular" class="w-full">
                <Tabs.List class="grid w-full grid-cols-2 mb-4">
                    <Tabs.Trigger value="vincular">Vincular</Tabs.Trigger>
                    <Tabs.Trigger value="compartir">Compartir PC</Tabs.Trigger>
                </Tabs.List>

                <!-- TAB 1: VINCULAR (CONECTARSE A OTRO PC / ANFITRIÓN) -->
                <Tabs.Content value="vincular" class="space-y-5">
                    <div class="space-y-3">
                        <div>
                            <h4
                                class="text-sm font-semibold flex items-center gap-2"
                            >
                                <Link class="w-4 h-4 text-primary" />
                                Vincular a otro PC
                            </h4>
                            <p class="text-xs text-muted-foreground mt-1">
                                Ingresa el código del PC anfitrión para sincronizar tu lienzo en tiempo real.
                            </p>
                        </div>
                        <form
                            onsubmit={(e) => {
                                e.preventDefault();
                                connectToPC();
                            }}
                            class="flex flex-col gap-2.5"
                        >
                            <Input
                                type="text"
                                bind:value={targetPeerId}
                                placeholder="Ej: A7X9F2"
                                class="text-center font-mono font-bold tracking-widest uppercase rounded-full h-11"
                            />
                            <Button
                                type="submit"
                                disabled={!targetPeerId.trim() || syncService.status === "connecting"}
                                class="w-full rounded-full h-10 font-bold"
                            >
                                {#if syncService.status === "connecting" && !syncService.isHost}
                                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                                    Conectando...
                                {:else}
                                    Conectar al Anfitrión
                                {/if}
                            </Button>
                        </form>
                    </div>
                </Tabs.Content>

                <!-- TAB 2: COMPARTIR PC (INICIAR SALA ANFITRIÓN PARA CELULAR U OTROS PCS) -->
                <Tabs.Content
                    value="compartir"
                    class="space-y-4 flex flex-col items-center"
                >
                    {#if syncService.status === "connected" && syncService.roomCode}
                        <div
                            class="bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 flex items-center justify-center animate-in fade-in duration-200"
                        >
                            <canvas
                                bind:this={canvasStandalone}
                                class="block max-w-full h-auto rounded-md"
                            ></canvas>
                        </div>

                        <div class="w-full space-y-2">
                            <p
                                class="text-xs text-center text-muted-foreground uppercase tracking-wider font-semibold"
                            >
                                Código de este PC
                            </p>
                            <div class="flex items-center gap-2">
                                <div
                                    class="font-mono font-bold tracking-widest text-center bg-muted flex-1 px-4 py-2.5 rounded-full text-sm truncate select-all border border-border/40"
                                >
                                    {peerId || syncService.roomCode}
                                </div>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onclick={copyPeerId}
                                    class="rounded-full shrink-0"
                                    title="Copiar código"
                                >
                                    {#if copied}
                                        <Check class="w-4 h-4 text-green-500" />
                                    {:else}
                                        <Copy
                                            class="w-4 h-4 text-muted-foreground"
                                        />
                                    {/if}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onclick={() => syncService.disconnect()}
                                    class="rounded-full shrink-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                    title="Detener uso compartido"
                                >
                                    <Unplug class="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <p class="text-xs text-center text-muted-foreground max-w-xs">
                            Escanea el QR con tu celular o comparte este código con otros PCs para vincularlos.
                        </p>

                        <!-- Connected Devices Section -->
                        {#if desktopState.clientConnections.length > 0}
                            <div class="w-full pt-3 border-t border-border space-y-2">
                                <h4 class="text-xs font-semibold text-foreground uppercase tracking-wider">
                                    Dispositivos Conectados ({desktopState.clientConnections.length})
                                </h4>
                                <div class="flex flex-col gap-1.5">
                                    {#each desktopState.clientConnections as conn}
                                        <div
                                            class="flex items-center justify-between bg-muted/50 px-3 py-2 rounded-xl"
                                        >
                                            <div class="flex items-center gap-2">
                                                <div
                                                    class="w-2 h-2 rounded-full bg-green-500 animate-pulse"
                                                ></div>
                                                <span
                                                    class="text-xs font-mono font-bold tracking-wider"
                                                    >{(conn as any).shortCode || conn.peer}</span
                                                >
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    {:else}
                        <div class="py-6 px-4 flex flex-col items-center text-center gap-4 w-full">
                            <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                                <QrCode class="w-7 h-7" />
                            </div>
                            <div class="space-y-1 max-w-xs">
                                <h4 class="text-sm font-semibold text-foreground">
                                    Compartir este lienzo
                                </h4>
                                <p class="text-xs text-muted-foreground leading-relaxed">
                                    Genera un código QR y un ID temporal para conectar tu celular u otros PCs sin iniciar conexiones automáticas al abrir la app.
                                </p>
                            </div>
                            <Button
                                onclick={handleStartSharing}
                                disabled={isStartingHost || syncService.status === "connecting"}
                                class="w-full rounded-full h-11 font-bold gap-2"
                            >
                                {#if isStartingHost || syncService.status === "connecting"}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                    <span>Iniciando sala...</span>
                                {:else}
                                    <Share2 class="w-4 h-4" />
                                    <span>Iniciar vinculación</span>
                                {/if}
                            </Button>
                        </div>
                    {/if}
                </Tabs.Content>
            </Tabs.Root>
        {/if}
    </Dialog.Content>
</Dialog.Root>
