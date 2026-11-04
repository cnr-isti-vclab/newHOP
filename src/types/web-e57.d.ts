declare module 'web-e57/e57_bg.js' {
  export function __wbg_set_wasm(value: WebAssembly.Exports): void;
  export function __wbindgen_string_new(pointer: number, length: number): number;
  export function __wbindgen_throw(pointer: number, length: number): never;
  export function convertE57(data: Uint8Array, format: string): string;
}

declare module 'web-e57/e57_bg.wasm?url' {
  const url: string;
  export default url;
}
