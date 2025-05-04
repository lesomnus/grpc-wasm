export class Table<K extends number, V> {
	// 0 is reserved.
	// Negative numbers are considered to be an error.
	private ticket: K = 1 as K;
	private conns = new Map<K, V>();

	set(conn: V): K {
		const n = this.ticket++ as K;
		this.conns.set(n, conn);
		return n;
	}
	get(id: K): V | undefined {
		return this.conns.get(id);
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
		if (v) this.conns.delete(id);
		return v;
	}
}
