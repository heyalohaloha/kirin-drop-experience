# Licences and third-party notices

Copyright (c) 2026 Daisuke, for the owned Drop experience and selected presentation
code. Daisuke approved publishing this limited code package under GPL-3.0-only
on 2026-10-09. The combined experience, its frontend, adapters and build scripts
are distributed under GPL-3.0-only; see `LICENSE`.
The independently reusable `dev/measurement-core` wrapper retains MIT; see
`LICENSE-MIT`. Third-party files retain their original licences and notices.
This does not license the rest of Kirin OS, the HP, fonts, photos or trademarks.

- Kirin OS presentation-only assets: owner permission from Daisuke (2026-10-09).
  The pinned commit, exact source paths, output hashes and adaptations are recorded
  in `dev/drop-preview/kirin-ui/source.json`. No private measurement engine,
  coefficients, models or product-storage code is included. Permission is limited
  to the selected presentation code, not private measurement code.

- `measurement-core`: `ebur128 0.1.10` (MIT) and pinned Rust dependencies.
- Instrument runtime: React 18.3.1, React DOM 18.3.1, Scheduler 0.23.2 (MIT).
  Build tool: esbuild 0.21.5 (MIT). Original packages and licence notices are
  included in `third-party-js`; the matching macOS compiler binary is a build
  prerequisite, not private Kirin code or a browser download.
- `psycho-core`: selected, byte-verified GPL-3.0-only calculations from public
  [Kirin Hypha commit 6ba9fe20](https://github.com/heyalohaloha/kirin_hypha/tree/6ba9fe20e681d369c1de08e1c74b1ef2406dc010).
  `dev/psycho-core/vendor/source.json` identifies every imported file.
- Dependencies: complete source and original licence/notice files in `third-party`.
  `dependencies.json` gives the locked package versions and declared licences.
  `unicode-ident` also declares Unicode-3.0; do not reduce it to MIT/Apache only.
- The unnamed 1.2.1 table source is attributable to MoSQITo Developers,
  [MoSQITo 1.2.1](https://pypi.org/project/mosqito/1.2.1/), Apache-2.0.
  The official source archive SHA-256 is
  `50c0ebdc5102c67cfe4362178ce07d7e6b3211d7cb3e6051082e503ff019f16f`.
  The 13 imported numeric arrays (1,037 values) were compared exactly against
  `_third_octave_levels.py`, `_main_loudness.py` and `_calc_slopes.py`.
  The package includes the original Apache licence, metadata and relevant source
  files under `third-party-mosqito`; the official archive has no NOTICE file.
  `table-provenance.json` records hashes and the comparison.
  Hypha's Rust tables are a transcription of these arrays; their original header
  and source hashes are preserved unchanged. This notice supplies the missing
  origin name without modifying calculations or claiming ISO certification.
- Saved reference values were generated with MoSQITo 1.2.1 and published in the
  GPL Hypha repository. `dev/reference-data/source.json` identifies the commit,
  URLs and hashes. The relevant public generators are
  `scripts/generate_phase_d_mosqito_golden.py` and
  `scripts/generate_perceptual_delta_mosqito_golden.py` in that repository.

The GPL text is included at `LICENSE` and `dev/psycho-core/vendor/LICENSE`.
Each dependency keeps its own licence. The source allowlist and exact binary
receipts are in `source-manifest.json`. This is a limited source-code publication,
not a declaration that the website demo has passed its production release gates.
