# Contributing to GitSink

Thank you for taking the time to contribute! The following guidelines will help
you get up and running quickly.

## Getting Started

1. **Fork** the repository and create your branch from `main`.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and fill in the required values.
4. Run the development server with `npm run start:dev`.

## Tests and Linting

Run the full test suite before submitting a pull request:

```bash
npm run lint
npm test
```

End-to-end tests are available with:

```bash
npm run test:e2e
```

## Docs

The project documentation lives in the `docs` folder and in the Docusaurus site
under `docs/docs-site`.

```bash
cd docs/docs-site
yarn install
yarn start
```

Please update documentation alongside code changes.

## Commit Messages

Use clear, descriptive commit messages. Squash commits when necessary to keep
the history clean.

## Pull Requests

1. Ensure all tests and linters pass.
2. Submit your pull request against the `main` branch.
3. Fill out the pull request template explaining what was changed and why.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you agree to abide by its terms.
