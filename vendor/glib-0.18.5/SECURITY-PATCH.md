# GLib 0.18 compatibility patch

Source: the unmodified `glib 0.18.5` crate from crates.io, published from
`gtk-rs/gtk-rs-core` commit `42b9caf98e03ded086362d9653ca58fe94dc8658`.
The upstream MIT license remains in `LICENSE`.

Tauri's GTK3 dependency still requires the 0.18 API. Upgrading this one crate to
0.20 is incompatible with that dependency tree. Both desktop workspaces therefore
use this shared path patch until upstream moves away from the affected series.

The only source change is the official fix in
[gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343),
for [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html):
`VariantStrIter::impl_get` passes a mutable pointer to the C output argument.
Its version remains 0.18.5 to describe the API honestly; this is a patched local
copy, not the vulnerable registry package. No advisory is globally ignored.

Linux verification runs the upstream iterator tests with release optimization:

```sh
cargo test --release --manifest-path vendor/glib-0.18.5/Cargo.toml --lib variant_iter::tests
```

Remove both `[patch.crates-io]` entries and this directory when the Tauri GTK
dependency supports a fixed upstream GLib version.
