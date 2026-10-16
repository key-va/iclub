<script lang="ts">
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf, nameOf } from '#lib/stores/guids.ts';

	let {
        guid = 'ladder_0000-00-00_00-00-00_bootstrap00s', //this should be teh entityId
		description = 'description',
	}: { guid?: string; description?: string; } = $props();

    let data = $derived($guids.items ?? []); //this should be the data

    let relatedUsers = $derived(
        data.filter(r => r.pk === guid && r.rk.startsWith('user')).sort((a, b) => Number(a.rank) - Number(b.rank))
    ); //this should be all rows related to the current entity

</script>
<div>
    <div class="white">
        <a class="route-link row right" href={`/genc/${guid}`}>   
            <p class="truncate"><strong>{nameOf(data, guid)}</strong><br />{description}</p>
            <div class="round-icon-small blue"
                style={`background-image: url('${PUBLIC_URL}/${guid}.jpg');`}
                aria-label={nameOf(data, guid)}
            ></div>
        </a>

        <div class="border blue">

        {#each relatedUsers as user}
            <a class="route-link row right " href={`/user/${user.rk}`}>
                <p class="truncate "><strong>{nameOf(data, user.rk)}</strong><br />{user.state} at rank {user.rank}</p>
                <div class="round-icon-small "
                    style={`background-image: url('${PUBLIC_URL}/${user.rk}.jpg');`}
                    aria-label={nameOf(data, user.rk)}
                ></div>
            </a>
        {/each}

        </div>

    </div>
</div>
<style>
	.route-link {
		color: inherit;
		text-decoration: none;
	}
    .white {
        padding-bottom: 2rem;
    }
    .border {
        border-top: 2px solid whitesmoke;
        border-bottom: 2px solid whitesmoke;
    }
</style>