# Contributing to contextd

Thank you for your interest in contributing to contextd! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/danfarrdotcom/contextd.git
cd contextd

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run type checking
pnpm typecheck
```

## Project Structure

```
packages/
  core/        # Core context loading, merging, and remote sync
  cli/         # Command-line interface
  worker/      # Cloudflare Worker API for remote context sharing
  vscode/      # VS Code extension
```

## Making Changes

1. **Create a branch** for your changes
2. **Write tests** for new features or bug fixes
3. **Ensure all tests pass**: `pnpm test`
4. **Run type checking**: `pnpm typecheck`
5. **Run linting**: `pnpm lint` (if available)
6. **Commit your changes** with a clear message

## CLI Commands

The CLI is the primary user interface. When adding commands:

- Use `console.error()` for human-readable output (status, errors)
- Use `console.log()` only for machine-readable data that may be piped
- Follow the existing error handling patterns with chalk for styling
- Add help text that matches the existing format

## Testing

- Tests are located in `packages/worker/test/`
- Use Vitest for test framework
- Add tests for new features in core and cli packages

## Pull Requests

- Describe what your change does and why
- Link any related issues
- Include screenshots for UI changes (VS Code extension)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
