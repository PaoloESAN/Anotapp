<script lang="ts">
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import * as AlertDialog from "$lib/components/ui/alert-dialog";

    let { count, onClear }: { count: number; onClear: () => void } = $props();
</script>

{#if count > 0}
    <AlertDialog.Root>
        <AlertDialog.Trigger
            class="group fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center rounded-full border border-red-900/30 dark:border-red-900/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur p-3 hover:px-5 text-sm font-semibold text-red-600 dark:text-red-400 shadow-xl transition-all duration-300 ease-out hover:bg-red-50 dark:hover:bg-red-950/50 hover:border-red-500/50 dark:hover:border-red-900/50 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
            title="Borrar todas las notas"
        >
            <Trash2 class="w-5 h-5 shrink-0" />
            <span class="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-2.5">
                Borrar todo
            </span>
        </AlertDialog.Trigger>
        <AlertDialog.Content
            class="bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-100"
        >
            <AlertDialog.Header>
                <AlertDialog.Title class="text-slate-800 dark:text-white"
                    >¿Estás absolutamente seguro?</AlertDialog.Title
                >
                <AlertDialog.Description
                    class="leading-relaxed text-slate-500 dark:text-zinc-400"
                >
                    Esta acción no se puede deshacer. Se borrarán
                    permanentemente del lienzo las
                    <span class="font-bold text-slate-700 dark:text-zinc-200"
                        >{count} anotaciones</span
                    > actuales.
                </AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer>
                <AlertDialog.Cancel
                    class="border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                    >Cancelar</AlertDialog.Cancel
                >
                <AlertDialog.Action
                    class="bg-red-600 px-4 py-2 font-semibold text-zinc-50 hover:bg-red-500 transition-colors"
                    onclick={onClear}
                >
                    Sí, borrar todo
                </AlertDialog.Action>
            </AlertDialog.Footer>
        </AlertDialog.Content>
    </AlertDialog.Root>
{/if}
