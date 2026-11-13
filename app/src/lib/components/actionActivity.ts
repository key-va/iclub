export function trackActions(node: HTMLElement, onChange: (count: number) => void) {
	const pending = new Set<EventTarget>();
	function update(event: Event) {
		if (!(event instanceof CustomEvent) || !event.target) return;
		if (event.detail === true) pending.add(event.target);
		else if (event.detail === false) pending.delete(event.target);
		else return;
		onChange(pending.size);
	}
	node.addEventListener('api-action-state', update);
	return { destroy: () => node.removeEventListener('api-action-state', update) };
}
