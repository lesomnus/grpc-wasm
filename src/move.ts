// Importing `Transfer` from "threads" causes an error
// because the worker environment lacks certain global
// variables required by the "threads" module.
import { Transfer } from "threads/worker";

export function move<T>(v: T, transfer: Transferable[]): T {
	return Transfer(v, transfer) as unknown as T;
}
