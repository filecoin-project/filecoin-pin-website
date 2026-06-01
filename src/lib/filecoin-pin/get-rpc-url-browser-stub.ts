// Browser stub for filecoin-pin's `common/get-rpc-url.js`. The real module
// statically imports node:fs/os/path for devnet support, which Rollup cannot
// bundle for the browser. filecoin-pin only reaches it via a lazy, try/catch
// guarded `import()` in resolveChainFromRpc, and only for devnet chain ids —
// a path the website never hits (it uses mainnet/calibration). Throwing here
// keeps that catch branch happy while excluding the node-only code.
export function resolveDevnetConfig(): never {
  throw new Error('Devnet RPC resolution is not supported in the browser')
}
