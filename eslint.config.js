import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    // The hexagonal core takes the clock, randomness and the host through ports (spec 027, HEX-001).
    files: ['packages/domain/src/**/*.ts', 'packages/application/src/**/*.ts'],
    languageOptions: {
      globals: {}
    },
    rules: {
      'no-restricted-globals': ['error', ...['process', 'console', 'Buffer', 'require', '__dirname', '__filename', 'window', 'document',
        'fetch', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'performance', 'crypto']
        .map(name => ({ name, message: 'The core takes host facilities through a port (docs/architecture/hexagonal.md).' }))],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Take the time from the Clock port.' },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Take the time from the Clock port.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Take randomness through a port so results are repeatable.' }
      ]
    }
  },
  {
    // The renderer talks to the main process only through the preload bridge (HEX-002).
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@main/*', '@astro/*', '**/main/**', '**/packages/**'], message: 'The renderer reaches the main process through window.api and @shared types only.' },
          { group: ['electron', 'fs', 'path', 'os', 'child_process', 'node:*'], message: 'The renderer has no Electron or Node access.' }
        ]
      }]
    }
  },
  {
    files: ['src/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    files: ['tests/**/*.ts', 'packages/*/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    ignores: ['out/', 'dist/', 'node_modules/', '*.config.*', '.vite/']
  }
)
