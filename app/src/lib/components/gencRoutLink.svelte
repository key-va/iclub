<script lang="ts">
	let {
		href = '/user/edit',
		title = 'Title',
		description = 'description',
        white = false,
        image = '',
	}: { href?: string; title?: string; description?: string; white?: boolean; image?: string } = $props();
</script>
<div>
    <a class="route-link" href={href}>
        <div class="row right {white ? 'white' : ''}">
            <p class="truncate"><strong>{title}</strong><br />{description}</p>
            <div class="round-icon-small blue" style="background-image: url('{image}');">
                {#if image === ''}
                <svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
                    <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>    
                {/if}
                
            </div>
        </div>
    </a>
</div>
<style>
	.route-link {
		color: inherit;
		text-decoration: none;
	}
</style>