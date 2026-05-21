<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { tick } from "svelte";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import Copy from "@lucide/svelte/icons/copy";
    import Pen from "@lucide/svelte/icons/pen";
    import FileIcon from "@lucide/svelte/icons/file";
    import ScanText from "@lucide/svelte/icons/scan-text";
    import Download from "@lucide/svelte/icons/download";
    import type { ClipboardItem } from "$lib/types";
    import { desktopState } from "../../routes/desktop-state.svelte";

    let {
        item = $bindable(),
        onBringToFront,
        onDragStart,
        onResizeStart,
        onCopy,
        onDelete,
        onScanText,
        hideHeaders,
        hideCardButtons,
    }: {
        item: ClipboardItem;
        onBringToFront: (id: string) => void;
        onDragStart: (e: PointerEvent, id: string) => void;
        onResizeStart: (e: PointerEvent, id: string, dir?: "se" | "sw") => void;
        onCopy: (item: ClipboardItem) => void;
        onDelete: (id: string) => void;
        onScanText?: (item: ClipboardItem) => void;
        hideHeaders?: boolean;
        hideCardButtons?: boolean;
    } = $props();

    let cardHeight = $state(0);
    let cardWidth = $state(0);

    function focusAndSelectEnd(node: HTMLTextAreaElement) {
        setTimeout(() => {
            node.focus();
            const length = node.value.length;
            node.setSelectionRange(length, length);
        }, 100);
    }
</script>

<div
    role="application"
    tabindex="-1"
    aria-label="Tarjeta del portapapeles"
    id="card-{item.id}"
    data-card-id={item.id}
    in:fly={{ y: 20, duration: 400, opacity: 0 }}
    out:fade={{ duration: 200 }}
    class="absolute group select-none flex flex-col {desktopState.draggedItemId ===
    item.id
        ? 'pointer-events-none'
        : ''}"
    style="left: {item.x}px; top: {item.y}px; z-index: {item.z}; {item.w
        ? `width: ${item.w}px;`
        : item.type === 'text'
          ? 'min-width: 200px; max-width: clamp(250px, 40vw, 400px);'
          : 'min-width: 150px;'} {item.h
        ? `height: ${item.h}px;`
        : item.type === 'text'
          ? 'max-height: clamp(120px, 35vh, 200px);'
          : ''}"
    onpointerdown={(e) => {
        if (e.button === 0) onBringToFront(item.id);
    }}
    oncontextmenu={async (e) => {
        e.preventDefault();
        // Si ya está abierto, lo cerramos primero para forzar el reposicionamiento
        if (desktopState.contextMenu.open) {
            desktopState.contextMenu.open = false;
            await tick();
        }

        // Pequeño retardo para asegurar que el componente anterior se desmontó
        await tick();

        desktopState.contextMenu.x = e.clientX;
        desktopState.contextMenu.y = e.clientY;
        desktopState.contextMenu.item = item;
        desktopState.contextMenu.open = true;
    }}
>
    <!-- Card Container -->
    <div
        role="presentation"
        tabindex="-1"
        bind:clientHeight={cardHeight}
        bind:clientWidth={cardWidth}
        class="rounded-2xl border border-slate-200/50 dark:border-zinc-700/50 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl shadow-2xl transition-all duration-300 group-hover:border-slate-300 dark:group-hover:border-zinc-600/80 group-hover:shadow-indigo-500/5 ring-1 ring-black/5 dark:ring-white/5 flex flex-col w-full flex-1 min-h-0 relative cursor-grab active:cursor-grabbing"
        onpointerdown={(e) => onDragStart(e, item.id)}
    >
        <!-- Header Handle -->
        {#if !hideHeaders}
            <div
                role="presentation"
                tabindex="-1"
                class="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/80 rounded-t-2xl cursor-grab active:cursor-grabbing"
                onpointerdown={(e) => onDragStart(e, item.id)}
            >
                <div
                    class="flex items-center space-x-2 text-slate-500 dark:text-zinc-400 min-w-0"
                >
                    {#if item.editingTitle}
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                            type="text"
                            bind:value={item.title}
                            autofocus
                            onpointerdown={(e) => e.stopPropagation()}
                            onblur={() => (item.editingTitle = false)}
                            onkeydown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape")
                                    item.editingTitle = false;
                            }}
                            class="text-xs font-semibold tracking-wider text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 rounded px-1.5 py-0.5 outline-none ring-1 ring-indigo-500/50 w-full max-w-[150px]"
                        />
                    {:else}
                        <div
                            role="button"
                            tabindex="-1"
                            aria-label="Editar título"
                            onpointerdown={(e) => e.stopPropagation()}
                            ondblclick={() => {
                                if (!item.title)
                                    item.title =
                                        item.type === "text"
                                            ? "TEXTO"
                                            : "IMAGEN";
                                item.editingTitle = true;
                            }}
                            class="text-xs font-semibold tracking-wider text-slate-400 dark:text-zinc-500 truncate cursor-text hover:text-slate-600 dark:hover:text-zinc-300 transition-colors px-1"
                            title="Doble clic para renombrar"
                        >
                            {item.title ||
                                (item.type === "text"
                                    ? "TEXTO"
                                    : item.type === "image"
                                      ? "IMAGEN"
                                      : `ARCHIVOS (${item.files?.length ?? 0})`)}
                        </div>
                    {/if}
                </div>

                {#if !hideCardButtons}
                    <div
                        class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                        {#if item.type === "text"}
                            <button
                                onpointerdown={(e) => e.stopPropagation()}
                                onclick={() => (item.editing = true)}
                                class="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                title="Editar texto"
                            >
                                <Pen class="w-3.5 h-3.5" />
                            </button>
                        {/if}
                        {#if item.type === "image" && onScanText}
                            <button
                                onpointerdown={(e) => e.stopPropagation()}
                                onclick={() => onScanText(item)}
                                class="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                title="Extraer Texto (OCR)"
                            >
                                <ScanText class="w-3.5 h-3.5" />
                            </button>
                        {/if}
                        {#if item.type === "peer-file"}
                            <button
                                onpointerdown={(e) => e.stopPropagation()}
                                onclick={() => {
                                    if (item.fileId)
                                        desktopState.requestFile(item.fileId);
                                }}
                                class="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                title="Descargar"
                            >
                                <Download class="w-3.5 h-3.5" />
                            </button>
                        {/if}
                        <button
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={() => onCopy(item)}
                            class="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors"
                            title="Copiar"
                        >
                            <Copy class="w-3.5 h-3.5" />
                        </button>
                        <button
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={() => onDelete(item.id)}
                            class="p-1.5 hover:bg-red-500/20 rounded-md text-slate-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-1"
                            title="Eliminar"
                        >
                            <Trash2 class="w-3.5 h-3.5" />
                        </button>
                    </div>
                {/if}
            </div>
        {/if}

        {#if hideHeaders && !hideCardButtons}
            <!-- Floating Actions for hideHeaders mode -->
            <div
                class="absolute top-2 right-2 flex {cardHeight < 90
                    ? 'flex-row'
                    : 'flex-col'} gap-1.5 items-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-50"
            >
                {#if item.type === "text"}
                    <button
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={() => (item.editing = true)}
                        class="p-2 bg-white/95 dark:bg-zinc-900/95 shadow-md border border-slate-200/80 dark:border-zinc-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                        title="Editar texto"
                    >
                        <Pen class="w-4 h-4" />
                    </button>
                {/if}
                {#if item.type === "image" && onScanText}
                    <button
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={() => onScanText(item)}
                        class="p-2 bg-white/95 dark:bg-zinc-900/95 shadow-md border border-slate-200/80 dark:border-zinc-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                        title="Extraer Texto (OCR)"
                    >
                        <ScanText class="w-4 h-4" />
                    </button>
                {/if}
                {#if item.type === "peer-file"}
                    <button
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={() => {
                            if (item.fileId)
                                desktopState.requestFile(item.fileId);
                        }}
                        class="p-2 bg-white/95 dark:bg-zinc-900/95 shadow-md border border-slate-200/80 dark:border-zinc-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                        title="Descargar"
                    >
                        <Download class="w-4 h-4" />
                    </button>
                {/if}
                <button
                    onpointerdown={(e) => e.stopPropagation()}
                    onclick={() => onCopy(item)}
                    class="p-2 bg-white/95 dark:bg-zinc-900/95 shadow-md border border-slate-200/80 dark:border-zinc-800/80 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Copiar"
                >
                    <Copy class="w-4 h-4" />
                </button>

                <button
                    onpointerdown={(e) => e.stopPropagation()}
                    onclick={() => onDelete(item.id)}
                    class="p-2 bg-white/95 dark:bg-zinc-900/95 shadow-md border border-slate-200/80 dark:border-zinc-800/80 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                    title="Eliminar"
                >
                    <Trash2 class="w-4 h-4" />
                </button>
            </div>
        {/if}

        <!-- Content Area -->
        <div
            class="flex-1 flex overflow-hidden min-h-0 {item.type === 'image'
                ? 'p-1.5'
                : 'p-4'}"
        >
            {#if item.type === "text"}
                {#if item.editing}
                    <textarea
                        use:focusAndSelectEnd
                        bind:value={item.content}
                        placeholder="Escribe aquí..."
                        onpointerdown={(e) => e.stopPropagation()}
                        onblur={() => {
                            item.editing = false;
                            desktopState.updateItemContent(
                                item.id,
                                item.content,
                            );
                        }}
                        onkeydown={(e) => {
                            if (e.key === "Escape") {
                                item.editing = false;
                                desktopState.updateItemContent(
                                    item.id,
                                    item.content,
                                );
                            }
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault(); // Evitar el salto de línea por defecto
                                item.editing = false;
                                desktopState.updateItemContent(
                                    item.id,
                                    item.content,
                                );
                            }
                        }}
                        class="w-full h-full bg-slate-50/50 dark:bg-zinc-950/50 rounded px-1 py-0.5 text-slate-800 dark:text-zinc-200 text-sm font-medium leading-relaxed resize-none outline-none ring-1 ring-indigo-500/50 custom-scrollbar wrap-break-word placeholder:text-slate-400/60 dark:placeholder:text-zinc-500/40"
                    ></textarea>
                {:else}
                    <div
                        role="textbox"
                        tabindex="-1"
                        aria-label="Contenido de texto"
                        onpointerdown={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                                e.stopPropagation();
                            } else {
                                onDragStart(e, item.id);
                            }
                        }}
                        class="text-slate-800 dark:text-zinc-200 text-sm font-medium leading-relaxed w-full h-full overflow-y-auto pr-3 custom-scrollbar wrap-break-word select-text rounded"
                        style="cursor: {item.editing
                            ? 'text'
                            : desktopState.isCtrlPressed
                              ? 'text'
                              : 'grab'};"
                        title="Arrastra para mover. Ctrl + Arrastrar para seleccionar."
                    >
                        {#if !item.content || item.content.trim() === ""}
                            <span
                                class="text-slate-400/60 dark:text-zinc-500/50 italic select-none cursor-default"
                                >Escribe aquí...</span
                            >
                        {:else}
                            <span
                                role="presentation"
                                tabindex="-1"
                                class="hover:bg-slate-100/50 dark:hover:bg-zinc-800/20 rounded transition-colors inline-block w-full whitespace-pre-wrap"
                                >{item.content}</span
                            >
                        {/if}
                    </div>
                {/if}
            {:else if item.type === "image"}
                <div
                    class="flex flex-1 items-center justify-center bg-transparent rounded overflow-hidden w-full h-full relative"
                >
                    <img
                        src={item.content}
                        alt="Clipboard capture"
                        class="w-full h-full object-contain pointer-events-none drop-shadow-lg z-10"
                    />
                </div>
            {:else if item.type === "peer-file"}
                <div
                    class="flex flex-col items-center justify-center p-2 h-full gap-2 text-slate-700 dark:text-zinc-300 w-full overflow-hidden"
                >
                    <FileIcon class="w-8 h-8 text-primary opacity-80" />
                    <div class="text-center w-full px-2">
                        <span
                            class="text-sm font-bold block truncate w-full"
                            title={item.name}>{item.name}</span
                        >
                        <span
                            class="text-xs text-muted-foreground font-medium mt-0.5 block"
                        >
                            {#if item.size !== undefined}
                                {#if item.size < 1024 * 1024}
                                    {Math.round(item.size / 1024)} KB
                                {:else if item.size < 1024 * 1024 * 1024}
                                    {(item.size / 1024 / 1024).toFixed(2)} MB
                                {:else}
                                    {(item.size / 1024 / 1024 / 1024).toFixed(
                                        2,
                                    )} GB
                                {/if}
                            {:else}
                                Desconocido
                            {/if}
                        </span>
                    </div>
                </div>
            {:else if (item.files?.length ?? 0) === 1}
                {@const filePath = item.files![0]}
                {@const fileName = filePath.split(/[/\\]/).pop() ?? filePath}
                {#if cardHeight < 80}
                    <!-- Strip: icon left, text right -->
                    <div
                        class="w-full h-full flex items-center gap-2 px-2 cursor-grab"
                        title={filePath}
                    >
                        <FileIcon class="w-5 h-5 shrink-0 text-primary" />
                        <span
                            class="text-xs font-medium text-slate-700 dark:text-zinc-300 truncate"
                            >{fileName}</span
                        >
                    </div>
                {:else}
                    <!-- Tall: icon fills space, scaled text pinned at bottom -->
                    {@const iconPx = Math.max(
                        24,
                        Math.min(cardWidth - 48, cardHeight - 56),
                    )}
                    {@const fontSize = Math.max(
                        11,
                        Math.min(18, Math.round(iconPx * 0.1)),
                    )}
                    <div
                        class="w-full h-full flex flex-col items-center p-3 gap-2 cursor-grab"
                        title={filePath}
                    >
                        <div
                            class="flex-1 min-h-0 flex items-center justify-center w-full"
                        >
                            <FileIcon
                                class="shrink-0 text-primary"
                                style="width: {iconPx}px; height: {iconPx}px;"
                            />
                        </div>
                        <span
                            class="shrink-0 text-center break-all font-medium text-slate-600 dark:text-zinc-400 line-clamp-3 w-full leading-snug"
                            style="font-size: {fontSize}px;">{fileName}</span
                        >
                    </div>
                {/if}
            {:else if cardWidth >= 220}
                <!-- Multiple files, wide: grid — icon above, name below -->
                {@const iconSize =
                    cardWidth < 320
                        ? "w-9 h-9"
                        : cardWidth < 500
                          ? "w-11 h-11"
                          : "w-14 h-14"}
                {@const colMin =
                    cardWidth < 320 ? 88 : cardWidth < 500 ? 108 : 132}
                <div
                    class="w-full h-full overflow-y-auto grid gap-2 p-1.5 content-start custom-scrollbar"
                    style="grid-template-columns: repeat(auto-fill, minmax({colMin}px, 1fr));"
                >
                    {#each item.files ?? [] as filePath}
                        {@const fileName =
                            filePath.split(/[/\\]/).pop() ?? filePath}
                        <div
                            class="flex flex-col items-center gap-2 p-2.5 rounded-xl hover:bg-slate-100/60 dark:hover:bg-zinc-800/40 transition-colors min-w-0 cursor-grab"
                            title={filePath}
                        >
                            <FileIcon
                                class="{iconSize} shrink-0 text-primary"
                            />
                            <span
                                class="text-[10px] leading-tight text-slate-600 dark:text-zinc-400 text-center break-all font-medium w-full line-clamp-2"
                                >{fileName}</span
                            >
                        </div>
                    {/each}
                </div>
            {:else}
                <!-- Multiple files, narrow: horizontal list — icon left, name right -->
                <div
                    class="w-full h-full overflow-y-auto flex flex-col gap-1 custom-scrollbar"
                >
                    {#each item.files ?? [] as filePath}
                        {@const fileName =
                            filePath.split(/[/\\]/).pop() ?? filePath}
                        <div
                            class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100/60 dark:hover:bg-zinc-800/40 transition-colors cursor-grab"
                            title={filePath}
                        >
                            <FileIcon class="w-4 h-4 shrink-0 text-primary" />
                            <span
                                class="text-xs text-slate-700 dark:text-zinc-300 truncate font-medium"
                                >{fileName}</span
                            >
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Lower Right Resizer Handle -->
        <div
            role="separator"
            tabindex="-1"
            aria-label="Redimensionar tarjeta"
            class="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-end justify-end p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-auto"
            onpointerdown={(e) => onResizeStart(e, item.id, "se")}
        >
            <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                class="text-zinc-500"
            >
                <path
                    d="M9 9L9 4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
                <path
                    d="M4 9L9 9"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
                <path
                    d="M5 5L9 9"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
            </svg>
        </div>

        <!-- Lower Left Resizer Handle -->
        <div
            role="separator"
            tabindex="-1"
            aria-label="Redimensionar tarjeta"
            class="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize flex items-end justify-start p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-auto"
            onpointerdown={(e) => onResizeStart(e, item.id, "sw")}
        >
            <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                class="text-zinc-500 scale-x-[-1]"
            >
                <path
                    d="M9 9L9 4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
                <path
                    d="M4 9L9 9"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
                <path
                    d="M5 5L9 9"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
            </svg>
        </div>
    </div>
</div>
