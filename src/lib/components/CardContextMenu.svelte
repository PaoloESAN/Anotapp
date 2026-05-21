<script lang="ts">
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import Copy from "@lucide/svelte/icons/copy";
    import ScanText from "@lucide/svelte/icons/scan-text";
    import Pen from "@lucide/svelte/icons/pen";
    import MoveRight from "@lucide/svelte/icons/move-right";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import Download from "@lucide/svelte/icons/download";
    import { desktopState } from "../../routes/desktop-state.svelte";

    let { onCopy, onDelete, onScanText } = $props<{
        onCopy: (item: any) => void;
        onDelete: (id: string) => void;
        onScanText: (item: any) => void;
    }>();

    const otherWorkspaces = $derived(
        desktopState.workspaces.filter(
            (ws) => ws.id !== desktopState.activeWorkspaceId,
        ),
    );
</script>

{#if desktopState.contextMenu.open}
    <div
        class="fixed z-9999 pointer-events-none"
        style="left: {desktopState.contextMenu.x}px; top: {desktopState
            .contextMenu.y}px;"
    >
        <DropdownMenu.Root bind:open={desktopState.contextMenu.open}>
            <DropdownMenu.Trigger class="w-px h-px" />
            <DropdownMenu.Content
                preventScroll={false}
                onCloseAutoFocus={(e) => e.preventDefault()}
                class="w-auto min-w-[140px] pointer-events-auto bg-background/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-1 z-10000 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                align="start"
                side="top"
                sideOffset={10}
                avoidCollisions={false}
            >
                <DropdownMenu.Item
                    onclick={() => onCopy(desktopState.contextMenu.item)}
                    class="flex items-center justify-between px-2.5 py-1.5 text-sm rounded-xl hover:bg-muted cursor-pointer transition-colors group"
                >
                    <div class="flex items-center gap-2.5">
                        <Copy
                            class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                        />
                        <span class="font-medium">Copiar</span>
                    </div>
                </DropdownMenu.Item>

                {#if desktopState.contextMenu.item?.type === "image" && onScanText}
                    <DropdownMenu.Item
                        onclick={() =>
                            onScanText(desktopState.contextMenu.item)}
                        class="flex items-center justify-between px-2.5 py-1.5 text-sm rounded-xl hover:bg-muted cursor-pointer transition-colors group"
                    >
                        <div class="flex items-center gap-2.5">
                            <ScanText
                                class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                            />
                            <span class="font-medium">OCR</span>
                        </div>
                    </DropdownMenu.Item>
                {/if}

                {#if desktopState.contextMenu.item?.type === "text"}
                    <DropdownMenu.Item
                        onclick={() => {
                            desktopState.contextMenu.item.editing = true;
                            desktopState.contextMenu.open = false;
                        }}
                        class="flex items-center justify-between px-2.5 py-1.5 text-sm rounded-xl hover:bg-muted cursor-pointer transition-colors group"
                    >
                        <div class="flex items-center gap-2.5">
                            <Pen
                                class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                            />
                            <span class="font-medium">Editar</span>
                        </div>
                    </DropdownMenu.Item>
                {/if}

                {#if desktopState.contextMenu.item?.type === "peer-file"}
                    <DropdownMenu.Item
                        onclick={() => {
                            if (desktopState.contextMenu.item?.fileId) {
                                desktopState.requestFile(
                                    desktopState.contextMenu.item.fileId,
                                );
                                desktopState.contextMenu.open = false;
                            }
                        }}
                        class="flex items-center justify-between px-2.5 py-1.5 text-sm rounded-xl hover:bg-muted cursor-pointer transition-colors group"
                    >
                        <div class="flex items-center gap-2.5">
                            <Download
                                class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                            />
                            <span class="font-medium">Descargar</span>
                        </div>
                    </DropdownMenu.Item>
                {/if}

                <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger
                        disabled={otherWorkspaces.length === 0}
                        class="flex items-center justify-between px-2.5 py-1.5 text-sm rounded-xl hover:bg-muted cursor-pointer transition-colors group {otherWorkspaces.length ===
                        0
                            ? 'opacity-30 cursor-default'
                            : ''}"
                    >
                        <div class="flex items-center gap-2.5">
                            <MoveRight
                                class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                            />
                            <span class="font-medium">Mover</span>
                        </div>
                    </DropdownMenu.SubTrigger>
                    {#if otherWorkspaces.length > 0}
                        <DropdownMenu.SubContent
                            class="min-w-[110px] w-auto bg-background/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-1 ml-1"
                        >
                            {#each otherWorkspaces as ws}
                                <DropdownMenu.Item
                                    onclick={() => {
                                        desktopState.moveItemToWorkspace(
                                            desktopState.contextMenu.item.id,
                                            ws.id,
                                        );
                                        desktopState.contextMenu.open = false;
                                    }}
                                    class="px-2.5 py-1.5 text-sm rounded-xl hover:bg-muted cursor-pointer transition-colors font-medium"
                                >
                                    {ws.name}
                                </DropdownMenu.Item>
                            {/each}
                        </DropdownMenu.SubContent>
                    {/if}
                </DropdownMenu.Sub>

                <DropdownMenu.Separator class="h-px bg-border/50 my-1.5" />

                <DropdownMenu.Item
                    onclick={() => onDelete(desktopState.contextMenu.item.id)}
                    class="flex items-center justify-between px-2.5 py-1.5 text-sm rounded-xl text-red-500 hover:bg-red-500/10 cursor-pointer transition-colors group"
                >
                    <div class="flex items-center gap-2.5">
                        <Trash2
                            class="w-4 h-4 group-hover:scale-110 transition-transform"
                        />
                        <span class="font-semibold">Eliminar</span>
                    </div>
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    </div>
{/if}
