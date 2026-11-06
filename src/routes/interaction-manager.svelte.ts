import { desktopState } from "./desktop-state.svelte";

class InteractionManager {
    activeDrag = $state<{ id: string; offsetX: number; offsetY: number } | null>(null);
    activeResize = $state<{
        id: string;
        startW: number;
        startH: number;
        startX: number;
        startY: number;
        startItemX: number;
        dir: "se" | "sw";
    } | null>(null);

    onDragStart(e: PointerEvent, id: string) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        const item = desktopState.items.find((i) => i.id === id);
        if (!item) return;
        item.z = desktopState.maxZ++;
        this.activeDrag = {
            id,
            offsetX: e.clientX - item.x,
            offsetY: e.clientY - item.y,
        };
        desktopState.draggedItemId = id;
        desktopState.pointerY = e.clientY;
        const el = e.currentTarget as HTMLElement;
        try {
            el.setPointerCapture(e.pointerId);
        } catch {}
    }

    onResizeStart(
        e: PointerEvent,
        id: string,
        dir: "se" | "sw" = "se",
    ) {
        e.stopPropagation();
        e.preventDefault();
        const item = desktopState.items.find((i) => i.id === id);
        if (!item) return;
        item.z = desktopState.maxZ++;
        const el = document.getElementById(`card-${item.id}`);
        const rect = el?.getBoundingClientRect();
        this.activeResize = {
            id: item.id,
            startW: rect ? rect.width : item.w || 280,
            startH: rect ? rect.height : item.h || 150,
            startX: e.clientX,
            startY: e.clientY,
            startItemX: item.x,
            dir,
        };
        const handle = e.currentTarget as HTMLElement;
        handle.setPointerCapture(e.pointerId);
    }

    onPointerMove(e: PointerEvent) {
        desktopState.pointerY = e.clientY;
        if (this.activeDrag) {
            const item = desktopState.items.find((i) => i.id === this.activeDrag!.id);
            if (item) {
                item.x = e.clientX - this.activeDrag!.offsetX;
                item.y = e.clientY - this.activeDrag!.offsetY;
            }
        } else if (this.activeResize) {
            const item = desktopState.items.find((i) => i.id === this.activeResize!.id);
            if (item) {
                const deltaX = e.clientX - this.activeResize!.startX;
                const deltaY = e.clientY - this.activeResize!.startY;
                const minW = 80;

                if (this.activeResize!.dir === "se") {
                    item.w = Math.max(minW, this.activeResize!.startW + deltaX);
                } else if (this.activeResize!.dir === "sw") {
                    const maxPossibleDelta = this.activeResize!.startW - minW;
                    const safeDeltaX = Math.min(deltaX, maxPossibleDelta);
                    item.w = this.activeResize!.startW - safeDeltaX;
                    item.x = this.activeResize!.startItemX + safeDeltaX;
                }

                item.h = Math.max(60, this.activeResize!.startH + deltaY);
            }
        }
    }

    onPointerUp(e: PointerEvent) {
        if (!this.activeDrag && !this.activeResize) return;

        let modifiedItemId: string | null = null;

        if (this.activeDrag) {
            modifiedItemId = this.activeDrag.id;
            const cardEl = document.getElementById(`card-${this.activeDrag.id}`);
            if (cardEl) cardEl.style.visibility = "hidden";
            const element = document.elementFromPoint(e.clientX, e.clientY);
            if (cardEl) cardEl.style.visibility = "";

            const wsButton = element?.closest("[data-workspace-button]");
            if (wsButton) {
                const wsId = wsButton.getAttribute("data-workspace-id");
                if (wsId) {
                    desktopState.moveItemToWorkspace(this.activeDrag.id, wsId);
                    modifiedItemId = null;
                }
            }
        } else if (this.activeResize) {
            modifiedItemId = this.activeResize.id;
        }

        if (modifiedItemId) {
            const item = desktopState.items.find(i => i.id === modifiedItemId);
            if (item) {
                desktopState.updateItemBounds(item.id, item.x, item.y, item.w, item.h, item.z);
            }
        }

        try {
            const el = e.target as HTMLElement;
            if (el && el.releasePointerCapture)
                el.releasePointerCapture(e.pointerId);
        } catch (err) { }
        this.activeDrag = null;
        this.activeResize = null;
        desktopState.draggedItemId = null;
        desktopState.pointerY = 0;
    }

    onWindowResize() {
        const padding = 20;
        desktopState.items.forEach((item) => {
            const el = document.getElementById(`card-${item.id}`);
            const w = item.w || el?.getBoundingClientRect().width || 280;
            const h = item.h || el?.getBoundingClientRect().height || 150;
            if (item.x + w > window.innerWidth - padding)
                item.x = Math.max(padding, window.innerWidth - w - padding);
            if (item.y + h > window.innerHeight - padding)
                item.y = Math.max(padding, window.innerHeight - h - padding);
            if (item.x < padding) item.x = padding;
            if (item.y < padding) item.y = padding;
        });
    }
}

export const interactionManager = new InteractionManager();
