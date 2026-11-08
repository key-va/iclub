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
				return 'Tap the share button, then Add to Home Screen (or open this page in Safari)';
			}
			return 'Tap the share button, then Add to Home Screen';
		}

		if (/Firefox/.test(ua)) {
			return isAndroid
				? 'Tap the menu, then Install'
				: 'Installing is not supported in Firefox on desktop, please use Chrome or Edge';
		}

		if (/SamsungBrowser/.test(ua)) return 'Tap the menu, then Add page to, then Home screen';
		if (isAndroid) return 'Tap the menu, then Install app or Add to Home screen';
		if (/Edg\//.test(ua)) return 'Click the menu, then Apps, then Install this site as an app';
		if (/Chrome/.test(ua)) return 'Click the install icon in the address bar, or the menu, then Install';
		if (/Safari/.test(ua)) return 'Click File, then Add to Dock';

		return 'Use your browser menu: Install app or Add to Home Screen';
	}

	$effect(() => {
		message = getInstructions();
	});
</script>

{#if !$installed}
<div class="install">
	<div class="group">
		<div class="row center">
			<p><strong>Install the app</strong> to receive notifications. You can log in and use the app in your browser.<br/><br/>{message || 'Use your browser menu to install the app'}</p>
		</div>
	</div>
</div>

{/if}
