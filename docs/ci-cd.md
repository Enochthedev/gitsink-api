# CI/CD Overview

GitSink uses GitHub Actions to run tests and build artifacts on every pull request.
The main workflow is defined in `.github/workflows/ci.yml` and performs linting,
unit tests and a production build. Markdown validation is handled in a separate
workflow `validate-markdown.yml`.

Documentation for the Docusaurus site is built using the `docs.yml` workflow.
