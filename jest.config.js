/** @type {import('jest').Config} */
const sharedConfig = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|lucide-react-native))',
  ],
}

module.exports = {
  // Coverage thresholds — regression guards. Raise as coverage improves.
  // Run: npx jest --coverage
  coverageThreshold: {
    // Core libraries — high coverage enforced
    './src/lib/validation.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/lib/format.ts': { branches: 75, functions: 100, lines: 85, statements: 85 },
    './src/lib/eventAlgorithm.ts': { branches: 65, functions: 100, lines: 80, statements: 80 },
    // Global minimum — floor guard, ratchet up over time
    global: { branches: 10, functions: 10, lines: 12, statements: 12 },
  },
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/hooks/**/*.ts',
    'src/components/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/**/types.ts',
    '!src/**/constants.ts',
  ],
  projects: [
    {
      ...sharedConfig,
      displayName: 'unit',
      testMatch: ['**/__tests__/*.test.ts', '**/__tests__/*.test.tsx', '**/__tests__/lib/**/*.test.ts'],
      testPathIgnorePatterns: [
        '/node_modules/',
        '__tests__/map-logic\\.test\\.ts',
        '__tests__/map-api\\.test\\.ts',
        '__tests__/map-crash\\.test\\.ts',
        '__tests__/components/',
        '__tests__/hooks/',
      ],
    },
    {
      ...sharedConfig,
      displayName: 'components',
      testMatch: ['**/__tests__/components/**/*.test.tsx'],
      setupFiles: ['<rootDir>/__tests__/setup.ts'],
    },
    {
      ...sharedConfig,
      displayName: 'hooks',
      testMatch: ['**/__tests__/hooks/**/*.test.ts', '**/__tests__/hooks/**/*.test.tsx'],
      setupFiles: ['<rootDir>/__tests__/setup.ts'],
    },
  ],
}
