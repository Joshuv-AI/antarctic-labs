#!/bin/sh
# Rebuild src/lib/tcb1-decoder.wasm from the Rust source in this dir.
# The compiled .wasm is a COMMITTED build artifact (like tcb1-data/):
# the Cloudflare Pages build has no Rust toolchain, so the decoder
# binary ships in the repo and vite serves it as a static asset.
#
# Toolchain: rustup with the wasm32-unknown-unknown target. In the
# agent VM it lives under ~/workspace/toolchains/rust (persistent);
# on a developer machine any rustup install works.
set -e
cd "$(dirname "$0")"
if [ -d "$HOME/workspace/toolchains/rust/cargo/bin" ]; then
  export RUSTUP_HOME="$HOME/workspace/toolchains/rust/rustup"
  export CARGO_HOME="$HOME/workspace/toolchains/rust/cargo"
  export PATH="$HOME/workspace/toolchains/rust/cargo/bin:$PATH"
fi
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/tcb1_decoder.wasm ../tcb1-decoder.wasm
echo "wrote ../tcb1-decoder.wasm ($(wc -c < ../tcb1-decoder.wasm) bytes)"
