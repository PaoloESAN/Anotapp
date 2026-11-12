<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import Download from "@lucide/svelte/icons/download";
    import Upload from "@lucide/svelte/icons/upload";
    import Sparkles from "@lucide/svelte/icons/sparkles";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import ImagePlus from "@lucide/svelte/icons/image-plus";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { setMode, resetMode } from "mode-watcher";
    import { onMount, onDestroy } from "svelte";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import { Label } from "$lib/components/ui/label/index.js";
    import { desktopState } from "../../../routes/desktop-state.svelte";

    let {
        open = $bindable(false),
        hideHeaders = $bindable(false),
        hideCardButtons = $bindable(false),
        bgPattern = $bindable("grid"),
    }: {
        open: boolean;
        hideHeaders: boolean;
        hideCardButtons: boolean;
        bgPattern: string;
    } = $props();

    let currentColor = $state("oklch(0.546 0.245 262.881)");
    let themeMode = $state("system");
    let fileInputRef: HTMLInputElement;

    // Mascot state (Desktop Tauri only)
    let isTauri = $state(false);
    let mascotEnabled = $state(false);
    let mascotSize = $state(160);
    let mascotOpacity = $state(100);
    let mascotPreviewUrl = $state<string | null>(null);
    let unlistenMascotClose: (() => void) | null = null;

    onMount(async () => {
        const savedColor = localStorage.getItem("anotapp-primary-color");
        if (savedColor) currentColor = savedColor;
        const savedMode = localStorage.getItem("mode-watcher-mode");
        if (savedMode) themeMode = savedMode;

        isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
        if (isTauri) {
            mascotEnabled = localStorage.getItem("anotapp-mascot-enabled") === "true";
            const savedSize = parseInt(localStorage.getItem("anotapp-mascot-size") || "160", 10);
            if (!Number.isNaN(savedSize)) mascotSize = Math.min(300, Math.max(80, savedSize));
            const savedOp = parseInt(localStorage.getItem("anotapp-mascot-opacity-pct") || "100", 10);
            if (!Number.isNaN(savedOp)) mascotOpacity = Math.min(100, Math.max(20, savedOp));

            try {
                const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
                const { listen } = await import("@tauri-apps/api/event");
                const filePath = await invoke<string | null>("get_mascot_file");
                mascotPreviewUrl = filePath ? convertFileSrc(filePath) : null;
                unlistenMascotClose = await listen("mascot-closed-by-user", () => {
                    mascotEnabled = false;
                });
            } catch (err) {
                console.error("Error loading mascot settings:", err);
            }
        }
    });

    onDestroy(() => {
        unlistenMascotClose?.();
    });

    async function toggleMascot(next: boolean) {
        if (!isTauri) return;
        mascotEnabled = next;
        localStorage.setItem("anotapp-mascot-enabled", String(next));
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            if (next) {
                let pos: { x?: number; y?: number } = {};
                try {
                    const savedPos = localStorage.getItem("anotapp-mascot-pos");
                    if (savedPos) pos = JSON.parse(savedPos);
                } catch {
                    // ignore
                }
                await invoke("open_mascot_window", {
                    size: mascotSize,
                    x: typeof pos.x === "number" ? pos.x : null,
                    y: typeof pos.y === "number" ? pos.y : null,
                });
            } else {
                await invoke("close_mascot_window");
            }
        } catch (err) {
            console.error("Error toggling mascot window:", err);
        }
    }

    async function handlePickMascotImage() {
        if (!isTauri) return;
        try {
            const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
            const selected = await openDialog({
                multiple: false,
                filters: [
                    {
                        name: "Imágenes y GIFs",
                        extensions: ["png", "jpg", "jpeg", "gif", "webp"],
                    },
                ],
            });
            if (!selected || typeof selected !== "string") return;

            const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
            const savedPath = await invoke<string>("save_mascot_file", {
                sourcePath: selected,
            });
            mascotPreviewUrl = convertFileSrc(savedPath);
            if (!mascotEnabled) {
                await toggleMascot(true);
            }
        } catch (err) {
            console.error("Error picking/saving mascot image:", err);
        }
    }

    async function handleClearMascotImage() {
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("clear_mascot_image");
            mascotPreviewUrl = null;
            if (mascotEnabled) {
                await toggleMascot(false);
            }
        } catch (err) {
            console.error("Error clearing mascot image:", err);
        }
    }

    async function handleMascotSizeChange(val: number) {
        mascotSize = val;
        localStorage.setItem("anotapp-mascot-size", String(val));
        if (!isTauri || !mascotEnabled) return;
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("set_mascot_size", { size: val });
        } catch (err) {
            console.error("Error resizing mascot:", err);
        }
    }

    async function handleMascotOpacityChange(val: number) {
        mascotOpacity = val;
        const normalized = val / 100;
        localStorage.setItem("anotapp-mascot-opacity-pct", String(val));
        localStorage.setItem("anotapp-mascot-opacity", String(normalized));
        if (!isTauri || !mascotEnabled) return;
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("set_mascot_opacity", { opacity: normalized });
        } catch (err) {
            console.error("Error changing mascot opacity:", err);
        }
    }

    let colors = [
        {
            name: "Azul Oscuro",
            value: "oklch(0.546 0.245 262.881)",
            class: "bg-blue-600 hover:!bg-blue-600",
        },
        {
            name: "Rojo Vivo",
            value: "oklch(0.6 0.25 25)",
            class: "bg-red-500 hover:!bg-red-500",
        },
        {
            name: "Verde Esmeralda",
            value: "oklch(0.65 0.15 150)",
            class: "bg-emerald-500 hover:!bg-emerald-500",
        },
        {
            name: "Rosa Neón",
            value: "oklch(0.65 0.25 330)",
            class: "bg-pink-500 hover:!bg-pink-500",
        },
        {
            name: "Dorado",
            value: "oklch(0.7 0.15 80)",
            class: "bg-yellow-500 hover:!bg-yellow-500",
        },
        {
            name: "Celeste",
            value: "oklch(0.6 0.15 240)",
            class: "bg-sky-400 hover:!bg-sky-400",
        },
    ];

    let patterns = [
        { id: "none", name: "Liso" },
        { id: "grid", name: "Cuadrícula" },
        { id: "dots", name: "Puntitos" },
        { id: "cross", name: "Cruces" },
        { id: "waves", name: "Ondas" },
        { id: "custom-image", name: "Imagen" },
    ];

    function setPrimaryColor(oklch: string) {
        document.documentElement.style.setProperty("--primary", oklch);
        localStorage.setItem("anotapp-primary-color", oklch);
        currentColor = oklch;
    }

    function handleSetMode(m: "light" | "dark" | "system") {
        themeMode = m;
        if (m === "system") {
            resetMode();
        } else {
            setMode(m);
        }
    }

    function handleCustomImage(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                let w = img.width;
                let h = img.height;
                if (w > 1920) {
                    h = (1920 / w) * h;
                    w = 1920;
                }
                canvas.width = w;
                canvas.height = h;
                ctx?.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL("image/webp", 0.8);

                try {
                    localStorage.setItem("anotapp-custom-bg-image", dataUrl);
                    bgPattern = "custom-image";
                    window.dispatchEvent(
                        new CustomEvent("anotapp-bg-updated", {
                            detail: dataUrl,
                        }),
                    );
                } catch (e) {
                    console.error("Imagen muy grande para guardar");
                }
            };
            img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
    }

    function handleImportClick() {
        if (fileInputRef) {
            fileInputRef.click();
        }
    }

    async function handleFileSelected(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];
        await desktopState.importWorkspaces(file);
        input.value = "";
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content
        class="sm:max-w-[500px] bg-background border-border text-foreground p-0 rounded-2xl shadow-2xl flex flex-col h-[85vh] md:h-auto max-h-[85vh] overflow-hidden"
    >
        <Dialog.Header class="shrink-0 p-6 pb-4 border-b">
            <Dialog.Title
                class="text-2xl font-bold tracking-tight text-foreground"
                >Configuración</Dialog.Title
            >
            <Dialog.Description class="text-muted-foreground mt-1.5">
                Adapta Anotapp a tus necesidades y gestiona tus datos.
            </Dialog.Description>
        </Dialog.Header>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
            <Tabs.Root value="appearance" class="w-full">
                <Tabs.List
                    class="grid w-full {isTauri ? 'grid-cols-4' : 'grid-cols-3'} mb-6 bg-muted/50 p-1 rounded-xl"
                >
                    <Tabs.Trigger
                        value="appearance"
                        class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm"
                        >Apariencia</Tabs.Trigger
                    >
                    <Tabs.Trigger
                        value="interface"
                        class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm"
                        >Interfaz</Tabs.Trigger
                    >
                    <Tabs.Trigger
                        value="data"
                        class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm"
                        >Datos</Tabs.Trigger
                    >
                    {#if isTauri}
                        <Tabs.Trigger
                            value="mascot"
                            class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm"
                            >Mascota</Tabs.Trigger
                        >
                    {/if}
                </Tabs.List>

                <!-- Pestaña Apariencia -->
                <Tabs.Content
                    value="appearance"
                    class="space-y-8 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                    <!-- Theme Control -->
                    <div class="flex flex-col gap-3">
                        <Label
                            class="text-sm font-semibold tracking-wide text-foreground uppercase"
                        >
                            Tema del sistema
                        </Label>
                        <div
                            class="flex items-center gap-2 bg-muted/40 p-1.5 rounded-xl border border-border/50"
                        >
                            <Button
                                variant="ghost"
                                onclick={() => handleSetMode("light")}
                                class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all {themeMode ===
                                'light'
                                    ? 'bg-background text-foreground shadow-sm border border-border/50 scale-100 hover:bg-background'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground scale-95'}"
                                >Claro</Button
                            >
                            <Button
                                variant="ghost"
                                onclick={() => handleSetMode("dark")}
                                class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all {themeMode ===
                                'dark'
                                    ? 'bg-background text-foreground shadow-sm border border-border/50 scale-100 hover:bg-background'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground scale-95'}"
                                >Oscuro</Button
                            >
                            <Button
                                variant="ghost"
                                onclick={() => handleSetMode("system")}
                                class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all {themeMode ===
                                'system'
                                    ? 'bg-background text-foreground shadow-sm border border-border/50 scale-100 hover:bg-background'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground scale-95'}"
                                >Auto</Button
                            >
                        </div>
                    </div>

                    <!-- Color Palette Control -->
                    <div class="flex flex-col gap-3">
                        <Label
                            class="text-sm font-semibold tracking-wide text-foreground uppercase"
                        >
                            Tono primario
                        </Label>
                        <div
                            class="flex items-center gap-3 bg-muted/40 p-4 rounded-xl border border-border/50 flex-wrap"
                        >
                            {#each colors as c}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onclick={() => setPrimaryColor(c.value)}
                                    class="{c.class} flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all hover:scale-110 active:scale-95 {currentColor ===
                                    c.value
                                        ? 'border-background ring-2 ring-primary ring-offset-2 ring-offset-background scale-110 shadow-lg shadow-primary/40'
                                        : 'border-transparent'}"
                                    title={c.name}
                                    aria-label={c.name}
                                >
                                    {#if currentColor === c.value}
                                        <Check
                                            class="w-5 h-5 text-white drop-shadow-md"
                                        />
                                    {/if}
                                </Button>
                            {/each}
                        </div>
                    </div>

                    <!-- Background Pattern Control -->
                    <div class="flex flex-col gap-3">
                        <Label
                            class="text-sm font-semibold tracking-wide text-foreground uppercase"
                        >
                            Fondo de Lienzo
                        </Label>
                        <div
                            class="flex items-center gap-3 bg-muted/40 p-4 rounded-xl border border-border/50 flex-wrap"
                        >
                            {#each patterns as p}
                                <Button
                                    variant="outline"
                                    onclick={() => {
                                        if (p.id === "custom-image") {
                                            document
                                                .getElementById(
                                                    "hidden-bg-upload",
                                                )
                                                ?.click();
                                        } else {
                                            bgPattern = p.id;
                                        }
                                    }}
                                    class="relative p-0 flex flex-col items-center justify-center w-18 h-14 rounded-xl border-2 overflow-hidden transition-all hover:scale-105 active:scale-95 {bgPattern ===
                                    p.id
                                        ? 'border-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-md shadow-primary/20'
                                        : 'border-border/60 hover:border-border'}"
                                    title={p.name}
                                    aria-label={p.name}
                                >
                                    <div
                                        class="absolute inset-0 bg-background pattern-{p.id}"
                                    ></div>
                                    <div
                                        class="relative z-10 flex items-center justify-center w-full h-full bg-background/50 backdrop-blur-[1px]"
                                    >
                                        <span
                                            class="text-xs font-semibold text-foreground/90 drop-shadow-sm"
                                            >{p.name}</span
                                        >
                                    </div>
                                </Button>
                            {/each}
                        </div>
                    </div>
                </Tabs.Content>

                <!-- Pestaña Interfaz -->
                <Tabs.Content
                    value="interface"
                    class="space-y-4 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                    <div
                        class="flex items-center justify-between gap-4 bg-muted/30 p-5 rounded-2xl border border-border/50 shadow-sm transition-colors hover:bg-muted/50"
                    >
                        <div class="space-y-1">
                            <Label
                                class="text-base font-semibold text-foreground"
                                >Ocultar Títulos</Label
                            >
                            <p class="text-sm text-muted-foreground">
                                Oculta los encabezados de las tarjetas para un
                                diseño más limpio.
                            </p>
                        </div>
                        <Switch bind:checked={hideHeaders} />
                    </div>

                    <div
                        class="flex items-center justify-between gap-4 bg-muted/30 p-5 rounded-2xl border border-border/50 shadow-sm transition-colors hover:bg-muted/50"
                    >
                        <div class="space-y-1">
                            <Label
                                class="text-base font-semibold text-foreground"
                                >Ocultar Botones de Tarjeta</Label
                            >
                            <p class="text-sm text-muted-foreground">
                                Oculta los botones de acción dentro de las
                                notas.
                            </p>
                        </div>
                        <Switch bind:checked={hideCardButtons} />
                    </div>
                </Tabs.Content>

                <!-- Pestaña Datos -->
                <Tabs.Content
                    value="data"
                    class="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                    <div
                        class="rounded-2xl border border-border/60 bg-muted/20 p-6 shadow-sm"
                    >
                        <h3
                            class="text-lg font-semibold text-foreground flex items-center gap-2 mb-2"
                        >
                            Respaldo y Restauración
                        </h3>
                        <p class="text-sm text-muted-foreground mb-6">
                            Exporta tus mesas de trabajo y notas a un archivo
                            seguro para tener un respaldo, o impórtalo en otro
                            dispositivo para no perder tu contenido.
                        </p>

                        <div class="flex flex-col gap-4">
                            <Button
                                variant="secondary"
                                class="w-full justify-start gap-3 h-12 text-base font-medium rounded-xl shadow-md"
                                onclick={() => desktopState.exportWorkspaces()}
                            >
                                <Download class="w-5 h-5" />
                                Exportar Datos
                            </Button>

                            <Button
                                variant="outline"
                                class="w-full justify-start gap-3 h-12 text-base font-medium rounded-xl border-border/60 hover:bg-accent"
                                onclick={handleImportClick}
                            >
                                <Upload class="w-5 h-5" />
                                Importar Datos
                            </Button>
                        </div>
                    </div>
                </Tabs.Content>

                {#if isTauri}
                    <!-- Pestaña Mascota (Solo Escritorio) -->
                    <Tabs.Content
                        value="mascot"
                        class="space-y-5 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                    >
                        <div
                            class="flex items-center justify-between gap-4 bg-muted/30 p-5 rounded-2xl border border-border/50 shadow-sm"
                        >
                            <div class="space-y-1">
                                <Label
                                    class="text-base font-semibold text-foreground flex items-center gap-2"
                                >
                                    <Sparkles class="w-4 h-4 text-primary" />
                                    Mascota Flotante
                                </Label>
                                <p class="text-sm text-muted-foreground">
                                    Muestra una imagen o GIF flotante siempre por encima de todas las ventanas. Puedes arrastrarla libremente.
                                </p>
                            </div>
                            <Switch
                                checked={mascotEnabled}
                                onCheckedChange={(val) => toggleMascot(val)}
                            />
                        </div>

                        <div
                            class="rounded-2xl border border-border/50 bg-muted/20 p-5 space-y-4"
                        >
                            <div class="flex items-center justify-between">
                                <Label class="text-sm font-semibold uppercase tracking-wide text-foreground">
                                    Imagen (PNG, JPG, GIF)
                                </Label>
                                {#if mascotPreviewUrl}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onclick={handleClearMascotImage}
                                        class="h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                                    >
                                        <Trash2 class="w-3.5 h-3.5" />
                                        Quitar
                                    </Button>
                                {/if}
                            </div>

                            <div class="flex items-center gap-4">
                                <div
                                    class="w-20 h-20 rounded-2xl border border-border/60 bg-muted/40 flex items-center justify-center overflow-hidden shrink-0"
                                >
                                    {#if mascotPreviewUrl}
                                        <img
                                            src={mascotPreviewUrl}
                                            alt="Vista previa mascota"
                                            class="w-full h-full object-contain"
                                        />
                                    {:else}
                                        <ImagePlus class="w-7 h-7 text-muted-foreground/60" />
                                    {/if}
                                </div>
                                <div class="flex-1 space-y-2">
                                    <Button
                                        variant="secondary"
                                        class="w-full justify-center gap-2 rounded-xl"
                                        onclick={handlePickMascotImage}
                                    >
                                        <ImagePlus class="w-4 h-4" />
                                        {mascotPreviewUrl ? "Cambiar imagen / GIF" : "Elegir imagen / GIF"}
                                    </Button>
                                    <p class="text-xs text-muted-foreground">
                                        Soporta PNG transparente, GIF animado, JPG y WebP.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="rounded-2xl border border-border/50 bg-muted/20 p-5 space-y-4">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between">
                                    <Label class="text-sm font-semibold text-foreground">Tamaño</Label>
                                    <span class="text-xs font-mono text-muted-foreground">{mascotSize} px</span>
                                </div>
                                <input
                                    type="range"
                                    min="80"
                                    max="300"
                                    step="10"
                                    value={mascotSize}
                                    oninput={(e) => handleMascotSizeChange(parseInt((e.target as HTMLInputElement).value, 10))}
                                    class="w-full accent-primary cursor-pointer"
                                />
                            </div>

                            <div class="space-y-2">
                                <div class="flex items-center justify-between">
                                    <Label class="text-sm font-semibold text-foreground">Opacidad</Label>
                                    <span class="text-xs font-mono text-muted-foreground">{mascotOpacity}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="20"
                                    max="100"
                                    step="5"
                                    value={mascotOpacity}
                                    oninput={(e) => handleMascotOpacityChange(parseInt((e.target as HTMLInputElement).value, 10))}
                                    class="w-full accent-primary cursor-pointer"
                                />
                            </div>
                        </div>
                    </Tabs.Content>
                {/if}
            </Tabs.Root>

            <!-- Inputs ocultos -->
            <input
                type="file"
                id="hidden-bg-upload"
                accept="image/*"
                class="hidden"
                onchange={handleCustomImage}
            />
            <input
                type="file"
                accept=".json"
                class="hidden"
                bind:this={fileInputRef}
                onchange={handleFileSelected}
            />
        </div>
    </Dialog.Content>
</Dialog.Root>
