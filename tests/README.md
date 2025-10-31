# Anava Local Connector - Test Suite

Comprehensive test suite for the Anava Local Connector using Vitest.

## Quick Start

```bash
cd tests
npm install
npm test
```

## Test Structure

```
tests/
├── unit/                    # Unit tests (no external dependencies)
│   ├── version-comparison.test.ts
│   └── config-validation.test.ts
├── integration/             # Integration tests (requires binary)
│   └── native-messaging.test.ts
├── package.json             # Test dependencies
├── vitest.config.ts         # Test configuration
└── README.md                # This file
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (development)
```bash
npm run test:watch
```

### UI Mode (interactive)
```bash
npm run test:ui
```

### Coverage Report
```bash
npm run test:coverage
```

View coverage report:
```bash
open coverage/index.html
```

### Run Specific Test File
```bash
npx vitest run unit/version-comparison.test.ts
```

### Run Tests Matching Pattern
```bash
npx vitest run --grep "version"
```

## Test Categories

### Unit Tests (`tests/unit/`)

Fast, isolated tests with no external dependencies.

**version-comparison.test.ts**
- Version string comparison logic
- Update detection
- Version parsing and validation
- Edge cases (zero versions, large numbers)

**config-validation.test.ts**
- Configuration validation logic
- Field presence and type checking
- URL validation
- Feature validation
- Configuration merging

**Run unit tests only:**
```bash
npx vitest run unit/
```

### Integration Tests (`tests/integration/`)

Tests that require the compiled binary and test end-to-end functionality.

**native-messaging.test.ts**
- Native messaging protocol implementation
- Message serialization/deserialization
- GET_VERSION command
- HEALTH_CHECK command
- Error handling
- Multiple sequential messages

**Prerequisites:**
Binary must be built before running integration tests:
```bash
cd ..
go build -o build/local-connector cmd/local-connector/main.go
```

**Run integration tests only:**
```bash
npx vitest run integration/
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';

function add(a: number, b: number): number {
  return a + b;
}

describe('Math Operations', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('should handle negative numbers', () => {
    expect(add(-1, 1)).toBe(0);
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('API Integration', () => {
  beforeAll(() => {
    // Setup (e.g., start server)
  });

  afterAll(() => {
    // Cleanup
  });

  it('should fetch data', async () => {
    const result = await fetchData();
    expect(result).toBeDefined();
  });
});
```

## CI/CD Integration

Tests run automatically in GitHub Actions:

**.github/workflows/test.yml**
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd tests && npm ci
      - run: cd tests && npm test
```

## Coverage Thresholds

Minimum coverage requirements (configured in `vitest.config.ts`):

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 70%
- **Statements**: 70%

Coverage reports are generated in `coverage/` directory.

## Debugging Tests

### Enable Verbose Logging
```bash
npx vitest run --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test:watch"],
  "cwd": "${workspaceFolder}/tests",
  "console": "integratedTerminal"
}
```

### Print Debug Info
```typescript
it('should debug', () => {
  console.log('Debug info:', someVariable);
  expect(true).toBe(true);
});
```

## Common Issues

### "Binary not found" in Integration Tests

**Solution**: Build the binary first:
```bash
go build -o build/local-connector cmd/local-connector/main.go
```

### Tests Timeout

**Solution**: Increase timeout in test:
```typescript
it('slow test', async () => {
  // Test code
}, 30000); // 30 second timeout
```

Or globally in `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    testTimeout: 30000
  }
});
```

### Module Import Errors

**Solution**: Ensure `package.json` has `"type": "module"` and imports use `.js` extension:
```typescript
// Correct
import { foo } from './utils.js';

// Wrong
import { foo } from './utils';
```

## Best Practices

1. **Keep Tests Fast**: Unit tests should run in milliseconds
2. **Test One Thing**: Each test should verify one behavior
3. **Use Descriptive Names**: Test names should explain what they verify
4. **Arrange-Act-Assert**: Structure tests clearly:
   ```typescript
   it('should do something', () => {
     // Arrange
     const input = createInput();
     
     // Act
     const result = doSomething(input);
     
     // Assert
     expect(result).toBe(expected);
   });
   ```
5. **Avoid Test Interdependence**: Tests should not depend on each other
6. **Clean Up**: Use `afterEach`/`afterAll` to clean up resources

## Contributing

When adding new features:

1. Write tests first (TDD approach preferred)
2. Ensure all existing tests pass
3. Maintain or improve coverage percentage
4. Add integration tests for external interfaces
5. Document complex test scenarios

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Chrome Native Messaging](https://developer.chrome.com/docs/apps/nativeMessaging/)

## Support

For test-related questions:
- GitHub Issues: https://github.com/AnavaAcap/anava-camera-extension/issues
- Label: `testing`
