export function trackActions(node: HTMLElement, onChange: (count: number) => void, eventName = 'api-action-state') {
	const pending = new Set<EventTarget>();
	function update(event: Event) {
		if (!(event instanceof CustomEvent) || !event.target) return;
		if (event.detail === true) pending.add(event.target);
		else if (event.detail === false) pending.delete(event.target);
		else return;
		onChange(pending.size);
	}
	const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => {
		const previousSize = pending.size;
		for (const target of pending) {
			if (target instanceof Node && !node.contains(target)) pending.delete(target);
		}
		if (pending.size !== previousSize) onChange(pending.size);
	});
	node.addEventListener(eventName, update);
	observer?.observe(node, { childList: true, subtree: true });
	return {
		destroy() {
			node.removeEventListener(eventName, update);
			observer?.disconnect();
		}
	};
}
