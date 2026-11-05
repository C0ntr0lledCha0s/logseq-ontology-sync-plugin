# Changelog

All notable changes to this plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Renamed to Ontology Schema Builder. Library presets are now called *roles* (CRM, Project Management), and what you build from them is a *schema*. Buttons, messages and the command read "schema" accordingly.
- Schemas are saved on a new hidden "Ontology Schemas" page. Schemas saved on the old "Ontology Roles" page still load and move to the new page when saved.
- Schema files use the format `ontology-schema`; files exported as `ontology-role` still import.

### Fixed
- A change that the builder cannot draw is undone and reported, instead of leaving the panel unresponsive until the change is reverted. A saved schema that cannot be drawn shows the error with a Close button.

## [0.2.0] - 2026-11-03

### Added
- Rebuilt as a role builder: compose a role from the union of one or more presets, then trim classes and properties.
- Source tags showing where each item came from (preset or added by you).
- Hidden "Ontology Roles" page for saving roles, plus role files for sharing them between graphs.
- Trimmed `:graph-ontology` EDN export for Logseq's own importer.
- Clash and removal warnings before export.
- Library and presets loaded from logseq-template-graph v2.0.0+ releases via raw.githubusercontent.com.
- Styling that follows the Logseq theme.

### Fixed
- Classes that extend a Logseq built-in, such as the project-management `Work Item` extending `Task`, no longer crash role selection and export.

### Removed
- Sync, import, and plugin-API class/property creation code.
