import 'vite/client'

/**
 * Narrow the shape of `import.meta.env` so our code gets autocomplete
 * and type-safety for public deployment configuration exposed via Vite.
 * Without this declaration the fields would fall back to `string | boolean | undefined`.
 */
interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string
}

/**
 * We are delcaring a name on the global interface because this repo should not be consumed.
 * Don't do this for libs, export proper types instead.
 */
declare global {
  const __SYNAPSE_SDK_VERSION__: string
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    debugDump?: () => void
  }
}
