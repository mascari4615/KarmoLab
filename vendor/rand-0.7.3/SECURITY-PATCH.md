# Rand 0.7 compatibility patch

Source: the `rand 0.7.3` crate from crates.io, upstream commit
`074cb6a997f91db653f8a53c755ddc07495ab429`. Original MIT and Apache-2.0
licenses remain in this directory.

Tauri's HTML parser still uses phf 0.8, which requires rand 0.7. This shared
path patch retains that API and applies the logging-removal fix from
[rust-random/rand#1763](https://github.com/rust-random/rand/pull/1763) for
[RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097.html).

Runtime logging macros and their three reseeding calls are removed. The `log`
feature remains as an empty compatibility feature; the log crate is only a test
dependency. Generator algorithms and the 0.7 reseeding-failure behavior remain
unchanged. The version stays 0.7.3; no advisory is globally ignored.

The regression test installs a logger that rejects callbacks and exercises both
periodic thread reseeding and an injected seed failure:

```sh
cargo test --release --manifest-path vendor/rand-0.7.3/Cargo.toml --features log --test log-reentrancy
```

Remove this directory and both Cargo patches when Tauri's parser no longer
requires rand 0.7. `Cargo.toml.orig` preserves the upstream source manifest.
