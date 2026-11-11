<script lang="ts">
	import { installed } from '#lib/stores/installed.ts';
	
	function isIos(): boolean {
	return /iPad|iPhone|iPod/.test(navigator.userAgent)
		|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	}

	function isAndroid(): boolean {
	return /Android/.test(navigator.userAgent);
	}

	function isMac(): boolean {
	return /Mac/.test(navigator.platform) && !isIos();
	}

	function isWindows(): boolean {
	return /Win/.test(navigator.platform);
	}

</script>

{#if !$installed}
<div class="install">
	<div class="group">
		<div class="row center">
			<p class="info"><strong>Install the Web App</strong></p>
		</div>
		<div class="row left">
			<p class="info">Intra Club is designed as a Progressive Web App (PWA). Install it on your device for the best experience.</p>
		</div>

		{#if isIos()}
		<div class="row left">
			<p class="info">On iOS, in Safari, tap "share" then "Add to Home Screen".</p>
		</div>
		
		{:else if isAndroid()}
		<div class="row left">
			<p class="info">On Android, in Google Chrome, look for "Install app" or "Add to Home Screen" in the browser options menu or pop-up message.</p>
		</div>
		{:else if isMac()}
		<div class="row left">
			<p class="info">On Mac, in Safari, click "File" then "Add to Dock".</p>
		</div>
		{:else if isWindows()}
		<div class="row left">
			<p class="info">On Windows, in Chrome or Edge, look for "Install app" or "Add to Home Screen" in the browser address bar or options menu.</p>
		</div>
		{:else}
		<div class="row left">
			<p class="info">Look for something like "Install app" or "Add to Home Screen" in the browser address bar or options menu.</p>
		</div>
		{/if}
	</div>
</div>

{/if}

<style>
	.group {
		background-color: lightcoral;
		border: 2px solid red;
	}

</style>