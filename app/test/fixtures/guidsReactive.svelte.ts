import { flushSync } from 'svelte';
import { entityOf, guids, nameOf, relationsOf, typeOf } from '../../src/lib/stores/guids.ts';

export { entityOf, guids, nameOf, relationsOf, typeOf };
export function watchGraph() {
	const observations: unknown[] = [];
	const stop = $effect.root(() => {
		// Deliberately no $guids.items: the lookup itself must establish tracking.
		const relatedRows = $derived(relationsOf('user_test'));
		const ladders = $derived(relatedRows.filter(row => typeOf(row.rk) === 'ladder'));
		const user = $derived(entityOf('user_test'));
		$effect(() => {
			observations.push({
				name: nameOf('user_test'),
				entityName: user?.name,
				ladders: ladders.map(row => ({ name: nameOf(row.rk), rank: row.rank })),
			});
		});
	});
	flushSync();
	return { observations, flush: () => flushSync(), stop };
}
