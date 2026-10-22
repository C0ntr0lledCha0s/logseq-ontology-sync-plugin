# Changelog

All notable changes to this plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-10-22

### Added
- Rebuilt as a role builder: compose a role from the union of one or more presets, then trim classes and properties.
- Source tags showing where each item came from (preset or added by you).
- Hidden "Ontology Roles" page for saving roles, plus role files for sharing them between graphs.
- Trimmed `:graph-ontology` EDN export for Logseq's own importer.
- Clash and removal warnings before export.
- Library and presets loaded from logseq-template-graph v2.0.0+ releases via raw.githubusercontent.com.
- Styling that follows the Logseq theme.

### Removed
- Sync, import, and plugin-API class/property creation code.
