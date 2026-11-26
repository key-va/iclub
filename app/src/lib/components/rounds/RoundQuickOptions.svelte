<script lang="ts">
	import ActionQuick from '../ActionQuick.svelte';
	import { setRoundRole } from '#lib/stores/remote.ts';
	import { roundQuickOptions, roundQuickRoles, roundRoleLabel } from './roundRules.ts';

	let { roundId, role, editable, allowSelection = false }: {
		roundId: string;
		role: unknown;
		editable: boolean;
		allowSelection?: boolean;
	} = $props();

	const visibleRoles = $derived(roundQuickRoles.filter((option) => allowSelection || option !== 'selected'));
	const options = $derived(editable ? roundQuickOptions(role, allowSelection) : []);
</script>

{#each visibleRoles as option}
	<ActionQuick
		inline
		name={roundRoleLabel(option)}
		disabled={!options.includes(option)}
		action={() => setRoundRole(roundId, option)}
	/>
{/each}
