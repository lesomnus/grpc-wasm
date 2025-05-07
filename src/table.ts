export class Table<K extends number, V> {
	// 0 is reserved.
	// Negative numbers are considered to be an error.
	private ticket: K = 1 as K;
	private values = new Map<K, V>();

	add(v: V): K {
		const n = this.ticket++ as K;
		this.values.set(n, v);
		return n;
	}
	get(id: K): V | undefined {
		return this.values.get(id);
	}
	must(id: K): V {
		const v = this.get(id);
		if (v == undefined) {
			throw new Error(`not found: ${id}`);
		}
		return v;
	}
	delete(id: K): V | undefined {
		const v = this.get(id);
		if (v) this.values.delete(id);
		return v;
	}
}
