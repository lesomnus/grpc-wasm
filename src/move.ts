// Importing `Transfer` from "threads" causes an error
// because the worker environment lacks certain global
// variables required by the "threads" module.
import { Transfer } from "threads/worker";
import type { TransferListItem } from "worker_threads";

export function move<T>(v: T, transfer: TransferListItem[]): T {
	return Transfer(v, transfer) as unknown as T;
}
