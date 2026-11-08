import { readable } from 'svelte/store';
import { browser } from '$app/env';

// Installed window mode, rather than whether another installed copy exists.
export const installed = readable(false, (set) => {
	if (!browser) return;
	const modes = ['standalone', 'fullscreen', 'minimal-ui'].map((mode) =>
		window.matchMedia(`(display-mode: ${mode})`)
	);
	const update = () => set(
		modes.some((mode) => mode.matches) ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
	update();
	modes.forEach((mode) => mode.addEventListener('change', update));
	window.addEventListener('pageshow', update);
	return () => {
		modes.forEach((mode) => mode.removeEventListener('change', update));
		window.removeEventListener('pageshow', update);
	};
});
