import { desktopState } from "./desktop-state.svelte";

class InteractionManager {
    // Infinite Canvas State
    pan = $state<{ x: number; y: number }>({ x: 0, y: 0 });
    zoom = $state<number>(1);
    isPanning = $state(false);
    showMinimap = $state<boolean>(false);
    heldCardId = $state<string | null>(null);

    // Active Card Drag & Resize
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

    // Gesture tracking for multi-touch & pan
    private activePointers = new Map<number, { x: number; y: number }>();
    private initialPinchDist = 0;
    private initialPinchZoom = 1;
    private initialPinchCenter = { x: 0, y: 0 };
    private initialPinchPan = { x: 0, y: 0 };
    isSpacePressed = $state(false);

    constructor() {
        if (typeof window !== "undefined") {
            try {
                const savedPan = localStorage.getItem("anotapp-canvas-pan");
                const savedZoom = localStorage.getItem("anotapp-canvas-zoom");
                const savedMinimap = localStorage.getItem("anotapp-show-minimap");
                if (savedPan) this.pan = JSON.parse(savedPan);
                if (savedZoom) this.zoom = Number(savedZoom) || 1;
                if (savedMinimap !== null) this.showMinimap = savedMinimap === "true";
            } catch (err) {
                console.warn("Could not load canvas view preferences:", err);
            }

            desktopState.viewportCenterProvider = () =>
                this.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);

            // Keyboard Spacebar for panning
            window.addEventListener("keydown", (e) => {
                if (e.code === "Space" && !this.isSpacePressed) {
                    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
                    if (tag !== "input" && tag !== "textarea") {
                        this.isSpacePressed = true;
                    }
                }
            });

            window.addEventListener("keyup", (e) => {
                if (e.code === "Space") {
                    this.isSpacePressed = false;
                }
            });

            window.addEventListener("blur", () => {
                this.isSpacePressed = false;
            });
        }
    }

    saveCanvasState() {
        if (typeof localStorage === "undefined") return;
        try {
            localStorage.setItem("anotapp-canvas-pan", JSON.stringify(this.pan));
            localStorage.setItem("anotapp-canvas-zoom", String(this.zoom));
            localStorage.setItem("anotapp-show-minimap", String(this.showMinimap));
        } catch {}
    }

    // Coordinate conversions
    screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
        return {
            x: (screenX - this.pan.x) / this.zoom,
            y: (screenY - this.pan.y) / this.zoom,
        };
    }

    canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
        return {
            x: canvasX * this.zoom + this.pan.x,
            y: canvasY * this.zoom + this.pan.y,
        };
    }

    // Zoom helpers
    zoomAtPoint(newZoom: number, clientX: number, clientY: number) {
        const clampedZoom = Math.min(3.0, Math.max(0.15, newZoom));
        if (Math.abs(clampedZoom - this.zoom) < 0.001) return;

        const zoomRatio = clampedZoom / this.zoom;
        this.pan.x = clientX - (clientX - this.pan.x) * zoomRatio;
        this.pan.y = clientY - (clientY - this.pan.y) * zoomRatio;
        this.zoom = Math.round(clampedZoom * 1000) / 1000;
        this.saveCanvasState();
    }

    zoomIn(factor = 1.25) {
        const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 500;
        const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 400;
        this.zoomAtPoint(this.zoom * factor, cx, cy);
    }

    zoomOut(factor = 0.8) {
        const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 500;
        const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 400;
        this.zoomAtPoint(this.zoom * factor, cx, cy);
    }

    resetZoom() {
        const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 500;
        const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 400;
        this.zoomAtPoint(1.0, cx, cy);
    }

    zoomToFit(padding = 60) {
        const items = desktopState.items;
        if (!items || items.length === 0) {
            this.pan = { x: 0, y: 0 };
            this.zoom = 1;
            this.saveCanvasState();
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const item of items) {
            const w = item.w || 280;
            const h = item.h || 160;
            minX = Math.min(minX, item.x);
            minY = Math.min(minY, item.y);
            maxX = Math.max(maxX, item.x + w);
            maxY = Math.max(maxY, item.y + h);
        }

        const contentW = Math.max(100, maxX - minX);
        const contentH = Math.max(100, maxY - minY);
        const centerX = minX + contentW / 2;
        const centerY = minY + contentH / 2;

        const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
        const screenH = typeof window !== "undefined" ? window.innerHeight : 800;

        const availW = Math.max(100, screenW - padding * 2);
        const availH = Math.max(100, screenH - padding * 2);

        const targetZoom = Math.min(
            1.2,
            Math.max(0.2, Math.min(availW / contentW, availH / contentH))
        );

        this.zoom = Math.round(targetZoom * 1000) / 1000;
        this.pan = {
            x: Math.round(screenW / 2 - centerX * this.zoom),
            y: Math.round(screenH / 2 - centerY * this.zoom),
        };
        this.saveCanvasState();
    }

    centerOnPoint(canvasX: number, canvasY: number) {
        const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
        const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
        this.pan.x = Math.round(screenW / 2 - canvasX * this.zoom);
        this.pan.y = Math.round(screenH / 2 - canvasY * this.zoom);
        this.saveCanvasState();
    }

    // Canvas Background / Viewport Gestures
    onCanvasPointerDown(e: PointerEvent) {
        // Space + left click or middle click or normal click on canvas background
        if (e.button !== 0 && e.button !== 1 && e.pointerType === "mouse") return;

        // If clicking on a card or interactive element, DO NOT pan canvas!
        const target = e.target as HTMLElement;
        if (
            target.closest("[data-card-id]") ||
            target.closest("[role='toolbar']") ||
            target.closest("button") ||
            target.closest("input") ||
            target.closest("textarea") ||
            target.closest("a")
        ) {
            return;
        }

        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.isPanning = true;

        if (this.activePointers.size === 2) {
            const pts = Array.from(this.activePointers.values());
            this.initialPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            this.initialPinchZoom = this.zoom;
            this.initialPinchCenter = {
                x: (pts[0].x + pts[1].x) / 2,
                y: (pts[0].y + pts[1].y) / 2,
            };
            this.initialPinchPan = { ...this.pan };
        }

        const el = e.currentTarget as HTMLElement;
        try {
            el?.setPointerCapture(e.pointerId);
        } catch {}
    }

    startCanvasPan(e: PointerEvent) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.isPanning = true;
    }

    onCanvasWheel(e: WheelEvent) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            // Trackpad pinch or Ctrl + Mouse wheel -> zoom centered at pointer
            const zoomDelta = -e.deltaY * 0.003;
            const newZoom = this.zoom * (1 + zoomDelta);
            this.zoomAtPoint(newZoom, e.clientX, e.clientY);
        } else {
            // Regular wheel: pan canvas
            const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
            const dy = e.shiftKey ? 0 : -e.deltaY;
            this.pan.x = Math.round(this.pan.x + dx);
            this.pan.y = Math.round(this.pan.y + dy);
            this.saveCanvasState();
        }
    }

    // Card Drag Start
    onDragStart(e: PointerEvent, id: string) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        const item = desktopState.items.find((i) => i.id === id);
        if (!item) return;
        item.z = desktopState.maxZ++;

        try {
            e.stopPropagation();
        } catch {}

        const canvasCoords = this.screenToCanvas(e.clientX, e.clientY);
        this.activeDrag = {
            id,
            offsetX: canvasCoords.x - item.x,
            offsetY: canvasCoords.y - item.y,
        };
        desktopState.draggedItemId = id;
        desktopState.pointerY = e.clientY;

        const el = document.getElementById(`card-${id}`);
        try {
            el?.setPointerCapture(e.pointerId);
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
            startW: rect ? rect.width / this.zoom : item.w || 280,
            startH: rect ? rect.height / this.zoom : item.h || 150,
            startX: e.clientX,
            startY: e.clientY,
            startItemX: item.x,
            dir,
        };
        const handle = e.currentTarget as HTMLElement;
        try {
            handle.setPointerCapture(e.pointerId);
        } catch {}
    }

    onPointerMove(e: PointerEvent) {
        desktopState.pointerY = e.clientY;

        // Card Dragging
        if (this.activeDrag) {
            const item = desktopState.items.find((i) => i.id === this.activeDrag!.id);
            if (item) {
                const canvasCoords = this.screenToCanvas(e.clientX, e.clientY);
                item.x = Math.round(canvasCoords.x - this.activeDrag!.offsetX);
                item.y = Math.round(canvasCoords.y - this.activeDrag!.offsetY);
            }
            return;
        }

        // Card Resizing
        if (this.activeResize) {
            const item = desktopState.items.find((i) => i.id === this.activeResize!.id);
            if (item) {
                const deltaCanvasX = (e.clientX - this.activeResize!.startX) / this.zoom;
                const deltaCanvasY = (e.clientY - this.activeResize!.startY) / this.zoom;
                const minW = 80;

                if (this.activeResize!.dir === "se") {
                    item.w = Math.round(Math.max(minW, this.activeResize!.startW + deltaCanvasX));
                } else if (this.activeResize!.dir === "sw") {
                    const maxPossibleDelta = this.activeResize!.startW - minW;
                    const safeDeltaX = Math.min(deltaCanvasX, maxPossibleDelta);
                    item.w = Math.round(this.activeResize!.startW - safeDeltaX);
                    item.x = Math.round(this.activeResize!.startItemX + safeDeltaX);
                }

                item.h = Math.round(Math.max(60, this.activeResize!.startH + deltaCanvasY));
            }
            return;
        }

        // Canvas Panning / Pinching
        if (this.isPanning && this.activePointers.has(e.pointerId)) {
            const prev = this.activePointers.get(e.pointerId)!;
            const current = { x: e.clientX, y: e.clientY };
            this.activePointers.set(e.pointerId, current);

            if (this.activePointers.size === 1) {
                // 1-finger touch or mouse pan
                const dx = current.x - prev.x;
                const dy = current.y - prev.y;
                this.pan.x = Math.round(this.pan.x + dx);
                this.pan.y = Math.round(this.pan.y + dy);
            } else if (this.activePointers.size >= 2) {
                // Multi-touch pinch zoom & pan
                const pts = Array.from(this.activePointers.values());
                const currentDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                const currentCenter = {
                    x: (pts[0].x + pts[1].x) / 2,
                    y: (pts[0].y + pts[1].y) / 2,
                };

                if (this.initialPinchDist > 0) {
                    const scaleFactor = currentDist / this.initialPinchDist;
                    const targetZoom = Math.min(3.0, Math.max(0.15, this.initialPinchZoom * scaleFactor));
                    const zoomRatio = targetZoom / this.initialPinchZoom;

                    this.pan.x = Math.round(currentCenter.x - (this.initialPinchCenter.x - this.initialPinchPan.x) * zoomRatio);
                    this.pan.y = Math.round(currentCenter.y - (this.initialPinchCenter.y - this.initialPinchPan.y) * zoomRatio);
                    this.zoom = Math.round(targetZoom * 1000) / 1000;
                }
            }
        }
    }

    onPointerUp(e: PointerEvent) {
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.delete(e.pointerId);
            if (this.activePointers.size === 0) {
                this.isPanning = false;
                this.initialPinchDist = 0;
                this.saveCanvasState();
            }
        }

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
            const item = desktopState.items.find((i) => i.id === modifiedItemId);
            if (item) {
                desktopState.updateItemBounds(item.id, item.x, item.y, item.w, item.h, item.z);
            }
        }

        try {
            const el = e.target as HTMLElement;
            if (el && el.releasePointerCapture) {
                el.releasePointerCapture(e.pointerId);
            }
        } catch {}

        this.activeDrag = null;
        this.activeResize = null;
        this.heldCardId = null;
        desktopState.draggedItemId = null;
        desktopState.pointerY = 0;
    }

    onWindowResize() {
        // Infinite canvas does not constrain items to fixed window bounds!
    }
}

export const interactionManager = new InteractionManager();
