# Logseq Ontology Sync Plugin

A Logseq plugin for managing and synchronizing ontology templates. This plugin enables importing EDN template files, managing ontology structures, and keeping your knowledge graph organized.

## Features

- Import ontology templates from EDN files
- Export current ontology structure
- Conflict detection and resolution
- Preview changes before importing
- Dry-run mode for safe testing
- Comprehensive logging and error handling

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
│   ├── api/             # Logseq API wrappers
│   ├── parser/          # EDN parsing logic
│   ├── ui/              # UI components
│   └── utils/           # Utility functions
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
bun test tests/parser.test.ts

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

## Usage

Once installed in Logseq:

1. Click the ontology sync icon in the toolbar
2. Use Command Palette (Cmd/Ctrl+Shift+P):
   - "Import Ontology Template" - Import from EDN file
   - "Export Ontology Template" - Export current structure

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
- [Issue #5](https://github.com/C0ntr0lledCha0s/logseq-template-graph/issues/5) - EDN Parser Requirements
- [Issue #10](https://github.com/C0ntr0lledCha0s/logseq-template-graph/issues/10) - Basic Import Functionality

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin/issues).
