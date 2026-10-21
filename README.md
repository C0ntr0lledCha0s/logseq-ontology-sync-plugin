# Logseq Ontology Sync Plugin

A Logseq plugin for DB graphs (desktop 2.0.x).

## What it does

Ontology Sync is a **role builder** for Logseq DB graphs (desktop 2.0.x; file-based graphs are not supported). It loads the Schema.org library and role presets published with the latest [logseq-template-graph](https://github.com/C0ntr0lledCha0s/logseq-template-graph) release, lets you compose a role from one or more presets, trim it down class by class and property by property, and exports a trimmed `:graph-ontology` EDN file that you import with Logseq's own importer.

The plugin never creates classes or properties through the plugin API. Logseq does the import itself.

## Using it

Click the toolbar icon or run **Ontology: Open role builder** from the Command Palette.

1. **Library.** On first use the plugin resolves the latest release tag of `C0ntr0lledCha0s/logseq-template-graph` (v2.0.0 or later) and downloads `library/schema-library.edn` and `library/schema-presets.edn` from that tag and caches them. It does not refetch on its own. Use **Update library** when you want the newest release.
2. **Pick presets.** Tick one or more presets. The selection is the union of all ticked presets.
3. **Trim.** Remove classes, and remove properties per class. Tags show where each item came from (which preset, or added by you).
4. **Save the role.** Roles are stored on a hidden page named "Ontology Roles" in your graph.
5. **Share roles.** Export a role as a JSON file (format `ontology-role`, version 1) and import it into another graph.
6. **Export EDN.** The plugin writes a trimmed `:graph-ontology` EDN file to your Downloads folder.
7. **Import into Logseq.** In Logseq choose **Import -> EDN to DB Graph** and select the file.

Idents in the library follow `:schema.class/*` and `:schema.property/*`; your own additions use `:custom.*`.

### Conflict check

Before exporting, the plugin compares the role's properties with the live graph. If a property already exists with a different type or cardinality, export is blocked and the clashes are listed. Resolve them in Logseq, then export again.

### Limitations

- **Re-import is additive.** Importing again never removes anything. If you trim a role after importing it, the removed classes and properties stay in the graph until you delete them by hand in Logseq. The plugin shows this warning when you export after switching off items that were previously exported.
- DB graphs only, desktop Logseq 2.0.x.
- The library comes from a GitHub release, so the first load needs network access.

## Development

This plugin is built with:

- [Bun](https://bun.sh) - Fast JavaScript runtime and package manager
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Vite](https://vitejs.dev/) - Fast build tool
- [ESLint](https://eslint.org/) & [Prettier](https://prettier.io/) - Code quality tools

### Prerequisites

- Bun >= 1.0.0
- Logseq desktop application

### Installation

```bash
# Clone the repository
git clone https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin.git
cd logseq-ontology-sync-plugin

# Install dependencies
bun install
```

### Development Workflow

```bash
# Start development server with hot reload
bun run dev

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun run test:coverage

# Type checking
bun run typecheck

# Lint code
bun run lint

# Fix linting issues
bun run lint:fix

# Format code
bun run format

# Check formatting
bun run format:check

# Build for production
bun run build
```

### Project Structure

```
logseq-ontology-sync-plugin/
├── .github/
│   └── workflows/       # GitHub Actions CI/CD
├── src/
│   ├── index.ts         # Plugin entry point
│   ├── edn/             # EDN reader/writer
│   ├── library/         # Release fetch + cache, library/preset parsing
│   ├── role/            # Selection, export, conflicts, role files
│   ├── logseq/          # Role store, live-graph reads, download
│   ├── ui/builder/      # View model, rendering, controller
│   ├── plugin-controller.ts # Toolbar button, command
│   └── utils/           # Logger
├── tests/               # Test files
├── dist/                # Build output (generated)
├── index.html           # Plugin HTML entry
├── package.json         # Package configuration
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
├── bunfig.toml          # Bun configuration
├── .eslintrc.json       # ESLint configuration
└── .prettierrc.json     # Prettier configuration
```

### Testing in Logseq

1. Build the plugin:
   ```bash
   bun run build
   ```

2. In Logseq:
   - Go to Settings → Plugins
   - Enable Developer Mode
   - Click "Load unpacked plugin"
   - Select the plugin directory

3. For development with hot reload:
   ```bash
   bun run dev
   ```
   Then reload the plugin in Logseq when changes are made.

### Running Tests

Tests are written using Bun's built-in test runner:

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/selection.test.ts

# Run with coverage report
bun run test:coverage
```

### Code Quality

The project uses ESLint and Prettier for code quality:

```bash
# Check for linting errors
bun run lint

# Auto-fix linting errors
bun run lint:fix

# Format all files
bun run format

# Check if files are formatted
bun run format:check
```

### CI/CD

GitHub Actions automatically runs on push and pull requests:

- Type checking with TypeScript
- Linting with ESLint
- Format checking with Prettier
- Unit tests with Bun
- Build validation

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`bun test && bun run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Related Issues

- [Issue #7](https://github.com/C0ntr0lledCha0s/logseq-template-graph/issues/7) - Plugin Scaffolding

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin/issues).
