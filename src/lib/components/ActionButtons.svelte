<script lang="ts">
    import Plus from "@lucide/svelte/icons/plus";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import MonitorSmartphone from "@lucide/svelte/icons/monitor-smartphone";
    import { desktopState } from "../../routes/desktop-state.svelte";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
    import Type from "@lucide/svelte/icons/type";
    import Image from "@lucide/svelte/icons/image";
    import FileIcon from "@lucide/svelte/icons/file";

    let {
        addEmptyText,
        openMobileLink,
        onSettings,
        hideHeaders = $bindable(false),
        bgPattern = $bindable("grid"),
    }: {
        addEmptyText: () => void;
        openMobileLink: () => void;
        onSettings: () => void;
        hideHeaders: boolean;
        bgPattern: string;
    } = $props();

    let imageInput: HTMLInputElement;

    async function handleImageSelect(e: Event) {
        const target = e.target as HTMLInputElement;
        if (!target.files || target.files.length === 0) return;

        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const b64 = (ev.target?.result as string).split(",")[1];
            desktopState.handleImageUpdate(b64);
        };
        reader.readAsDataURL(file);
    }

    let genericFileInput: HTMLInputElement;

    function handleFileSelect(e: Event) {
        const target = e.target as HTMLInputElement;
        if (!target.files || target.files.length === 0) return;

        for (let i = 0; i < target.files.length; i++) {
            const file = target.files[i];
            const fileId = crypto.randomUUID();
            desktopState.hostedFiles.set(fileId, file);
            desktopState.addPeerFile(fileId, file.name, file.size);
        }
        target.value = "";
    }

    let isMenuOpen = $state(false);
</script>

<input
    bind:this={imageInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={handleImageSelect}
/>

<input
    bind:this={genericFileInput}
    type="file"
    multiple
    class="hidden"
    onchange={handleFileSelect}
/>

<!-- Action Buttons (Bottom Left) -->
<div class="fixed bottom-6 left-6 z-50 flex flex-col items-center gap-3">
    <button
        onclick={openMobileLink}
        class="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 backdrop-blur-md text-muted-foreground shadow-md transition-all hover:bg-muted hover:border-border hover:text-foreground hover:scale-105 active:scale-95"
        title="Vincular Dispositivos"
    >
        <MonitorSmartphone class="w-5 h-5" />
    </button>

    <DropdownMenu.Root bind:open={isMenuOpen}>
        <DropdownMenu.Trigger>
            {#snippet child({ props })}
                <button
                    {...props}
                    class="flex h-12 w-12 items-center justify-center rounded-full border transition-all shadow-xl
                    {isMenuOpen
                        ? 'bg-primary/20 border-primary/60 scale-105 text-primary backdrop-blur-md'
                        : 'border-primary/30 bg-background/80 backdrop-blur-md text-primary hover:bg-primary/10 hover:border-primary/50 hover:text-primary/80 hover:scale-105 active:scale-95'}"
                    title="Agregar contenido"
                >
                    <Plus class="w-6 h-6" />
                </button>
            {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
            onCloseAutoFocus={(e) => e.preventDefault()}
            align="start"
            side="right"
            class="mb-2 ml-2 min-w-[160px] rounded-xl border-border/50 bg-background/95 backdrop-blur-lg shadow-2xl"
        >
            <DropdownMenu.Item
                onclick={addEmptyText}
                class="flex items-center gap-2 py-2.5 cursor-pointer"
            >
                <Type class="w-4 h-4 text-primary" />
                <span>Nueva Nota</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
                onclick={() => imageInput.click()}
                class="flex items-center gap-2 py-2.5 cursor-pointer"
            >
                <Image class="w-4 h-4 text-primary" />
                <span>Imagen</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
                onclick={() => genericFileInput.click()}
                class="flex items-center gap-2 py-2.5 cursor-pointer"
            >
                <FileIcon class="w-4 h-4 text-primary" />
                <span>Archivo</span>
            </DropdownMenu.Item>
        </DropdownMenu.Content>
    </DropdownMenu.Root>

    <button
        onclick={onSettings}
        class="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 backdrop-blur-md text-muted-foreground shadow-md transition-all hover:bg-muted hover:border-border hover:text-foreground hover:scale-105 active:scale-95"
        title="Configuración"
    >
        <SettingsIcon class="w-5 h-5" />
    </button>
</div>
