<script lang="ts">
	import { installed } from '#lib/stores/installed.ts';
	let message = $state('');

	function getInstructions(): string {
		const ua = navigator.userAgent;
		const isIos =
			/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const isAndroid = /Android/.test(ua);

		if (isIos) {
			if (/CriOS|FxiOS|EdgiOS/.test(ua)) {
				return 'Tap the share button, then Add to Home Screen (or open this page in Safari).';
			}
			return 'Tap the share button, then Add to Home Screen.';
		}

		if (/Firefox/.test(ua)) {
			return isAndroid
				? 'Tap the menu, then Install.'
				: 'Installing is not supported in Firefox on desktop, please use Chrome or Edge.';
		}

		if (/SamsungBrowser/.test(ua)) return 'In the browser menu tap "Add page to", then "Home screen".';
		if (isAndroid) return 'In the browser menu, look for "Install app" or "Add to Home screen".';
		if (/Edg\//.test(ua)) return 'In the browser menu, tap "Apps", then "Install this site as an app".';
		if (/Chrome/.test(ua)) return 'Click the install icon in the address bar, or open the browser menu and look for "Install app" or "Add to Home Screen".';
		if (/Safari/.test(ua)) return 'Click "File" in the browser menu, then "Add to Dock".';

		return 'Open the browser menu and look for something like "Install app" or "Add to Home Screen".';
	}

	$effect(() => {
		message = getInstructions();
	});
</script>

{#if !$installed}
<div class="install">
	<div class="group">
		<div class="row center">
			<p class="info"><strong>Install the Web App</strong></p>
		</div>
		<div class="row left">
			<p class="info">Intra Club is designed as a Progressive Web App (PWA). Installing the app ensures you get the best experience.</p>
		</div>
		<div class="row left">
			<p class="info">To install the app on your device:<br/>{message || 'Open the browser menu and look for something like "Install app" or "Add to Home Screen."'}</p>
		</div>
	</div>
</div>

{/if}
