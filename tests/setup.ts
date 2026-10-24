import 'fake-indexeddb/auto'
import { initializeWasm } from '@automerge/automerge/slim'
import { readFile } from 'node:fs/promises'
await initializeWasm(
  await readFile(
    new URL('../node_modules/@automerge/automerge/dist/automerge.wasm', import.meta.url),
  ),
)
