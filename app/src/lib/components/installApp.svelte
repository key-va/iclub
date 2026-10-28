<script lang="ts">
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

<div class="install">
	<div class="row center white">
		<p>Looks like you're using the app in a browser. <strong>Install</strong> the app first, then experience the full logged in experience<br/><br/>{message || 'install the app to login'}</p>
	</div>
</div>
