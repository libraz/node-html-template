module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname
  },
  plugins: [
    '@typescript-eslint',
    'import'
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json'
      },
      node: {
        extensions: ['.ts', '.js', '.json']
      }
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts']
    }
  },
  rules: {
    // Import rules for ESM (require .js extension for local imports)
    'import/extensions': ['error', 'ignorePackages', {
      ts: 'never',
      js: 'always'
    }],
    'import/prefer-default-export': 'off',

    // Environment-specific overrides
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

    // Allow specific underscore-prefixed names
    'no-underscore-dangle': ['error', {
      allow: [
        '__dirname',
        '__filename',
        '__first__',
        '__last__',
        '__inner__',
        '__outer__',
        '__odd__',
        '__even__',
        '__counter__',
        '__index__'
      ],
      allowAfterThis: false,
      allowAfterSuper: false,
      enforceInMethodNames: true
    }],

    // Allow hasOwnProperty for specific use cases
    'no-prototype-builtins': 'warn',

    // Relaxed rules for better development experience
    'max-len': ['error', {
      code: 120,
      ignoreUrls: true,
      ignoreComments: false,
      ignoreRegExpLiterals: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true
    }],

    // No trailing commas preference
    'comma-dangle': ['error', 'never'],

    'no-restricted-syntax': ['error',
      {
        selector: 'LabeledStatement',
        message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.'
      },
      {
        selector: 'WithStatement',
        message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.'
      }
    ],

    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true
    }],

    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-inferrable-types': 'off',

    // Allow continue statement (useful for performance)
    'no-continue': 'off',

    // Allow ++ operator (useful for loops)
    'no-plusplus': 'off',

    // Allow bitwise operators (useful for performance)
    'no-bitwise': 'off'
  },
  overrides: [
    // Test files configuration
    {
      files: [
        'tests/**/*.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
        'bench/**/*.ts',
        'benchmarks/**/*.ts'
      ],
      rules: {
        'import/no-extraneous-dependencies': ['error', {
          devDependencies: true
        }],
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'max-len': 'off'
      }
    },

    // Config files configuration
    {
      files: [
        '*.config.ts',
        '*.config.js',
        '*.config.cjs'
      ],
      env: {
        node: true
      },
      rules: {
        'no-console': 'off',
        'import/no-extraneous-dependencies': ['error', {
          devDependencies: true
        }]
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.min.js',
    '*.d.ts',
    '.vitest/'
  ]
};
