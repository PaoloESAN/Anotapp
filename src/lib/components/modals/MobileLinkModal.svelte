<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import QRCode from "qrcode";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import Link from "@lucide/svelte/icons/link";
    import Unplug from "@lucide/svelte/icons/unplug";
    import { desktopState } from "../../../routes/desktop-state.svelte";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    let {
        open = $bindable(false),
        peerId = "",
    }: { open: boolean; peerId: string } = $props();

    let canvas = $state<HTMLCanvasElement>();
    let copied = $state(false);
    let targetPeerId = $state("");

    const baseUrl = "https://anotapp-mobile.vercel.app/mobile";

    $effect(() => {
        if (open && canvas && peerId) {
            const url = `${baseUrl}?peerId=${peerId}`;
            QRCode.toCanvas(
                canvas,
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
        if (peerId) {
            navigator.clipboard.writeText(peerId);
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
            <div class="space-y-6">
                <div class="space-y-3">
                    <h4 class="text-sm font-semibold text-foreground">
                        Este PC
                    </h4>
                    <div
                        class="font-mono font-bold tracking-widest text-center bg-muted flex-1 px-4 py-2.5 rounded-full text-sm truncate select-all"
                    >
                        {peerId || "Generando ID..."}
                    </div>
                </div>

                <div class="pt-4 border-t border-border space-y-3">
                    <h4 class="text-sm font-semibold text-foreground">
                        Conectado a:
                    </h4>
                    <div
                        class="flex items-center justify-between bg-muted/50 p-2.5 rounded-[1rem]"
                    >
                        <div class="flex items-center gap-2">
                            <div
                                class="w-2 h-2 rounded-full bg-green-500"
                            ></div>
                            <span
                                class="text-sm font-mono font-bold tracking-widest"
                                >{desktopState.connectedHostCode}
                                <span
                                    class="text-xs text-muted-foreground font-sans tracking-normal font-normal"
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
                                desktopState.hostConnection?.close();
                                desktopState.hostConnection = null;
                            }}
                        >
                            <Unplug class="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        {:else}
            <Tabs.Root value="mobile" class="w-full">
                <Tabs.List class="grid w-full grid-cols-2 mb-4">
                    <Tabs.Trigger value="mobile">Celular</Tabs.Trigger>
                    <Tabs.Trigger value="pc">Otros PCs</Tabs.Trigger>
                </Tabs.List>

                <!-- TAB: CELULAR -->
                <Tabs.Content
                    value="mobile"
                    class="space-y-4 flex flex-col items-center"
                >
                    <div
                        class="bg-white p-2 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800 flex items-center justify-center"
                    >
                        <canvas
                            bind:this={canvas}
                            class="block max-w-full h-auto rounded-md"
                        ></canvas>
                    </div>
                    {#if peerId}
                        <div class="text-center w-full">
                            <p
                                class="text-xs text-muted-foreground uppercase tracking-wider font-semibold"
                            >
                                ID de Conexión
                            </p>
                            <p
                                class="font-mono bg-muted px-5 py-2.5 rounded-full text-sm mt-1.5 select-all inline-block font-bold tracking-widest"
                            >
                                {peerId}
                            </p>
                        </div>
                    {/if}
                    <p class="text-xs text-center text-muted-foreground">
                        Escanea el código para enviar texto e imágenes desde tu
                        celular.
                    </p>
                </Tabs.Content>

                <!-- TAB: PCS -->
                <Tabs.Content value="pc" class="space-y-6">
                    <!-- PC Anfitrión -->
                    <div class="space-y-3">
                        <div>
                            <h4
                                class="text-sm font-semibold flex items-center gap-2"
                            >
                                <span class="w-2 h-2 rounded-full bg-green-500"
                                ></span>
                                PC Anfitrión
                            </h4>
                            <p class="text-xs text-muted-foreground mt-1">
                                Comparte este ID para que otros PCs se conecten
                                a tu lienzo. Límite sugerido: 10 dispositivos.
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <div
                                class="font-mono font-bold tracking-widest text-center bg-muted flex-1 px-4 py-2.5 rounded-full text-sm truncate select-all"
                            >
                                {peerId || "Generando ID..."}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onclick={copyPeerId}
                                class="rounded-full shrink-0"
                                title="Copiar ID"
                            >
                                {#if copied}
                                    <Check class="w-4 h-4 text-green-500" />
                                {:else}
                                    <Copy
                                        class="w-4 h-4 text-muted-foreground"
                                    />
                                {/if}
                            </Button>
                        </div>
                    </div>

                    {#if desktopState.clientConnections.length === 0}
                        <div class="relative">
                            <div class="absolute inset-0 flex items-center">
                                <span class="w-full border-t border-muted"
                                ></span>
                            </div>
                            <div
                                class="relative flex justify-center text-xs uppercase"
                            >
                                <span
                                    class="bg-background px-2 text-muted-foreground"
                                    >O</span
                                >
                            </div>
                        </div>

                        <!-- Vincular a PC -->
                        <div class="space-y-3">
                            <div>
                                <h4
                                    class="text-sm font-semibold flex items-center gap-2"
                                >
                                    <Link class="w-4 h-4 text-primary" />
                                    Vincular a PC
                                </h4>
                                <p class="text-xs text-muted-foreground mt-1">
                                    Pega el ID de otro PC. Tu lienzo será
                                    reemplazado temporalmente por el del
                                    anfitrión.
                                </p>
                            </div>
                            <div class="flex flex-col gap-2">
                                <Input
                                    type="text"
                                    bind:value={targetPeerId}
                                    placeholder="Ej: A7X9F2"
                                    class="text-center font-mono font-bold tracking-widest uppercase rounded-full"
                                />
                                <Button
                                    onclick={connectToPC}
                                    disabled={!targetPeerId.trim()}
                                    class="w-full rounded-full h-10 font-bold"
                                >
                                    Conectar al Anfitrión
                                </Button>
                            </div>
                        </div>
                    {/if}

                    <!-- Connected Devices Section -->
                    {#if desktopState.clientConnections.length > 0}
                        <div class="pt-4 border-t border-border space-y-3">
                            <h4 class="text-sm font-semibold text-foreground">
                                Dispositivos Conectados
                            </h4>
                            <div class="flex flex-col gap-2">
                                {#each desktopState.clientConnections as conn}
                                    <div
                                        class="flex items-center justify-between bg-muted/50 p-2.5 rounded-[1rem]"
                                    >
                                        <div class="flex items-center gap-2">
                                            <div
                                                class="w-2 h-2 rounded-full bg-blue-500"
                                            ></div>
                                            <span
                                                class="text-sm font-mono font-bold tracking-widest"
                                                >{(conn as any).shortCode || conn.peer}</span
                                            >
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title="Desconectar"
                                            class="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-full shrink-0"
                                            onclick={() => {
                                                conn.close();
                                                desktopState.clientConnections =
                                                    desktopState.clientConnections.filter(
                                                        (c) => c !== conn,
                                                    );
                                            }}
                                        >
                                            <Unplug class="w-4 h-4" />
                                        </Button>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </Tabs.Content>
            </Tabs.Root>
        {/if}
    </Dialog.Content>
</Dialog.Root>
