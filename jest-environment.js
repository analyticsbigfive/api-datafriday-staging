// Custom Jest environment to handle Node.js 25 localStorage issues
// See: https://github.com/jestjs/jest/issues/14925

const { TestEnvironment } = require('jest-environment-node');

// Patch to prevent localStorage access issues in Node.js 25
const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
if (originalDescriptor && originalDescriptor.get) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

class CustomEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
  }
}

module.exports = CustomEnvironment;
