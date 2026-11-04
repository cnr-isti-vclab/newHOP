import { __wbg_set_wasm, __wbindgen_string_new, __wbindgen_throw, convertE57 } from 'web-e57/e57_bg.js';
import wasmUrl from 'web-e57/e57_bg.wasm?url';

let wasmReady: Promise<void> | undefined;

export async function convertE57ToXyz(data: Uint8Array): Promise<string> {
  if (!wasmReady) wasmReady = initializeWasm();
  await wasmReady;
  return convertE57(data, 'XYZ');
}

async function initializeWasm(): Promise<void> {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`Unable to load E57 decoder: ${response.status} ${response.statusText}`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {
    './e57_bg.js': {
      __wbindgen_string_new,
      __wbindgen_throw
    }
  });
  __wbg_set_wasm(instance.exports);
}
