import 'vite/client'

/**
 * Narrow the shape of `import.meta.env` so our code gets autocomplete
 * and type-safety for the Filecoin credentials exposed via Vite.
 * Without this declaration the fields would fall back to `string | boolean | undefined`.
 */
interface ImportMetaEnv {
  readonly VITE_FILECOIN_PRIVATE_KEY?: string
  readonly VITE_WALLET_ADDRESS?: string
  readonly VITE_SESSION_KEY?: string
  readonly VITE_FILECOIN_RPC_URL?: string
  readonly VITE_WARM_STORAGE_ADDRESS?: string
}

/**
 * We are delcaring a name on the global interface because this repo should not be consumed.
 * Don't do this for libs, export proper types instead.
 */
declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    debugDump?: () => void
  }
}
