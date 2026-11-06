<script lang="ts">
	import "./layout.css";
	import favicon from "$lib/assets/favicon.svg";
	import { ModeWatcher } from "mode-watcher";
	import { onMount } from "svelte";
	let { children } = $props();

	onMount(() => {
		const savedColor = localStorage.getItem("anotapp-primary-color");
		if (savedColor) {
			document.documentElement.style.setProperty("--primary", savedColor);
		} else {
			document.documentElement.style.setProperty(
				"--primary",
				"oklch(0.546 0.245 262.881)",
			);
		}
	});

	async function handleKeydown(e: KeyboardEvent) {
		if (e.key === "F11") {
			e.preventDefault();
			if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
				try {
					const { getCurrentWindow } = await import("@tauri-apps/api/window");
					const win = getCurrentWindow();
					const isFullscreen = await win.isFullscreen();
					await win.setFullscreen(!isFullscreen);
				} catch (err) {
					console.error("Error setting fullscreen in Tauri:", err);
				}
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} oncontextmenu={(e) => { if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) e.preventDefault(); }} />
<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />
{@render children()}
