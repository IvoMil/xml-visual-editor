# Coding Standards

## C++ Standards

### Language

- **C++20** standard (`CMAKE_CXX_STANDARD 20`)
- Use concepts, ranges, structured bindings, `std::expected` (C++23 or polyfill)
- RAII and value semantics by default

### Style (Google C++ with modifications)

- **ColumnLimit**: 120
- **IndentWidth**: 4
- **Naming**:
  - `PascalCase` — types, classes, enums, concepts
  - `snake_case` — functions, methods, variables, parameters
  - `kPascalCase` — constants (`constexpr`, `const`)
  - `UPPER_CASE` — macros only
  - `snake_case_` — private member variables (trailing underscore)
- **Namespaces**: `xve::` (root), `xve::document::`, `xve::schema::`, `xve::services::`, `xve::json_rpc::`
- **Headers**: `#pragma once`, include what you use, forward-declare when possible
- **Strings**: `std::string` and `std::string_view`, no C-style strings

### Error Handling

- `std::expected<T, Error>` for recoverable errors (or `std::optional<T>`)
- Exceptions only at system boundaries (file I/O, JSON parsing)
- No raw `new` / `delete` — use `std::make_unique`, `std::make_shared`, or value types

### Dependencies

- XML: **pugixml** only
- JSON: **nlohmann_json** only
- Testing: **Catch2** only
- Benchmarks: **Google Benchmark**
- No other XML/JSON/test libraries

## TypeScript Standards

- **Strict mode**: `strict: true` in tsconfig.json
- **ESLint**: airbnb-typescript-prettier rules
- **Prettier**: 2-space indent, single quotes, trailing commas
- VS Code Extension API patterns (Disposable, activation events)

## Formatting Tools

| Language | Tool | Config |
|----------|------|--------|
| C++ | clang-format | `.clang-format` (Google + 120 chars) |
| C++ | clang-tidy | `.clang-tidy` (modernize, cppcoreguidelines, readability) |
| CMake | cmake-format | `.cmake-format.yaml` |
| TypeScript | Prettier | `.prettierrc` |
| TypeScript | ESLint | `.eslintrc.json` |

## Documentation

- **Document as-is**: describe current code, never reference history
- Doxygen-style doc comments for public C++ APIs (`///` or `/** */`)
- JSDoc for public TypeScript APIs
- Historical context belongs only in CHANGELOG.md and ADRs

### File Size Limits

- Individual source files (`.cpp`, `.h`, `.ts`) must stay under **500 lines**.
- If a file exceeds this limit during development, **refactor** it into smaller focused files before completing the task.
- The code-janitor agent and quality gate scripts enforce this limit.

### Enforcement

After any refactor or reorganization, update **all** affected documentation,
docstrings, and comments to reflect the current state as if it always existed
this way. This is part of the definition of done for any code change.

---

## Enforcement

### Automated Checks

All code must pass:

---

## References


**Status:** Active  
**Last Updated:**   
**Next Review:** 

