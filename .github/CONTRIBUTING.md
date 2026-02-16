# Contributing to NutriBin

Thank you for your interest in contributing to NutriBin! We welcome improvements, bug reports, and new feature ideas.

## Project Structure

NutriBin currently consists of:

- `Backend/`: A NestJS application handling the API, database (PostgreSQL/Supabase), and services.

## How to contribute

- Discuss big changes or feature ideas by opening an issue first.
- For bug reports, please include:
  - Steps to reproduce the issue.
  - Expected vs. actual behavior.
  - Screenshots or logs if applicable.
- When you're ready to contribute code, open a Pull Request (PR) with a clear title and description.

## Development setup

### Prerequisites

- **Node.js**: LTS version recommended.
- **npm**: Installed with Node.js.
- **PostgreSQL**: Local instance or access to a Supabase project.

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables by creating a `.env` file. You will at least need:
   - `DATABASE_URL`: Your PostgreSQL/Supabase connection string.
4. Start the development server:
   ```bash
   npm run start:dev
   ```

> **Tip:** Check the `Backend/scripts` folder and `package.json` for data seeding scripts (e.g., `npm run seed:admin`).

## Branching & PR guidelines

- Create a feature branch from `main`: `feature/short-description` or `fix/short-description`.
- Keep commits focused and use clear commit messages.
- Ensure your changes follow the existing code style and pass linting.

## Code style

- **Backend**: Follow NestJS and TypeScript best practices. Use Prettier for formatting (`npm run format`).

## Code of conduct

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). Respectful, inclusive behavior is expected.

---

## Pull Request checklist

Before opening a PR, please make sure your changes meet the checklist below:

- [ ] I have tested my changes locally.
- [ ] My code follows the project's code style.
- [ ] I have updated documentation if necessary.
- [ ] All new and existing tests pass (if applicable).

Suggested PR description template:

```markdown
### Description

- What changed and why.

### How to test

- Steps to verify the changes.

### Screenshots (if applicable)

- Add any relevant screenshots for frontend changes.
```
