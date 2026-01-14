# Contributing to Logseq Ontology Sync Plugin

Thank you for considering contributing to this project! Here are some guidelines to help you get started.

## Development Setup

1. Install [Bun](https://bun.sh) (>= 1.0.0)
2. Fork and clone the repository
3. Install dependencies: `bun install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Running the Development Server

```bash
bun run dev
```

This starts Vite in development mode with hot reload enabled.

### Testing

We use Bun's built-in test runner:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run with coverage
bun run test:coverage
```

All new features should include tests. Aim for high code coverage.

### Code Quality

Before submitting a PR, ensure your code passes all checks:

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Format checking
bun run format:check
```

To automatically fix issues:

```bash
# Fix linting errors
bun run lint:fix

# Format code
bun run format
```

## Coding Standards

- Use TypeScript for all code
- Follow the existing code style (enforced by ESLint and Prettier)
- Write meaningful commit messages
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Prefer functional programming patterns where appropriate

## Commit Messages

Follow conventional commit format:

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Example:
```
feat(parser): add support for nested EDN structures

Implemented recursive parsing for deeply nested EDN data structures.
This enables handling of complex ontology templates.

Closes #42
```

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Add tests for new functionality
3. Ensure all tests pass and code is linted
4. Update documentation as needed
5. Link related issues in the PR description
6. Request review from maintainers

## Project Structure

```
src/
├── index.ts           # Plugin entry point
├── api/               # Logseq API wrappers
├── parser/            # EDN parsing logic
├── ui/                # UI components
└── utils/             # Utility functions
```

When adding new modules:
- Place them in the appropriate directory
- Export public APIs through index files
- Add comprehensive tests
- Document with JSDoc comments

## Testing in Logseq

To test your changes in Logseq:

1. Build the plugin: `bun run build`
2. Open Logseq → Settings → Plugins
3. Enable Developer Mode
4. Click "Load unpacked plugin"
5. Select this directory

For development, use `bun run dev` and reload the plugin in Logseq to see changes.

## Reporting Issues

When reporting issues, please include:

- Logseq version
- Plugin version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant error messages or logs

## Feature Requests

Feature requests are welcome! Please:

1. Check if the feature already exists or is planned
2. Open an issue with the `enhancement` label
3. Describe the use case and expected behavior
4. Consider submitting a PR to implement it

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

## Questions?

Feel free to open an issue with the `question` label or reach out to the maintainers.

Thank you for contributing! 🎉
