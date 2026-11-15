<!-- Purpose: collects likely panel questions and clear answers. Connects: project decisions and implementation explanations. -->

# Viva questions

## How does the browser give price data to the Rust engine?
The TypeScript wrapper asks Rust to reserve enough WebAssembly memory, then copies the AGT1 bytes there once. Rust reads the bytes in place for a run. We call that zero-copy only for the Rust-side reads after the initial transfer; the browser-to-WASM write is still a copy.

## Why does the TypeScript wrapper recreate typed-array views?
WebAssembly can grow its linear memory. Growth can replace the JavaScript buffer, so a view created before growth may no longer point at the current memory. The wrapper creates result views only after calls that may grow memory.

## Why are trades returned as columns?
Each field is stored contiguously, so the web chart or table can read only the fields it needs. It also gives every trade field a simple pointer and length contract.
