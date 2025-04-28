import { defineConfig } from '@pandacss/dev'
import pandaPreset from '@pandacss/preset-panda'

import { button} from "./src/button.recipe"

export default defineConfig({
  // Whether to use css reset
  preflight: true,

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx}', './pages/**/*.{js,jsx,ts,tsx}'],
  presets: [pandaPreset],
  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {
      recipes: {
        button,
      },
      tokens: {
        lineHeights: {
          normal: { value: 1.4 }
        }
      },
      semanticTokens: {
        colors: {
          danger: {
            value: { base: '{colors.red.200}', _dark: '{colors.orange.300}' },
          },
          success: {
            value: { base: '{colors.green.300}', _dark: '{colors.lime.400}' },
          },
          bg: {
            DEFAULT: { value: '{colors.yellow.100}' },
            muted: { value: '{colors.gray.100}' },
            text: {
              value: {
                base: '{colors.blue.100}',
                _light: '{colors.blue.200}',
                _dark: '{colors.blue.300}',
                md: {
                  base: '{colors.blue.900}',
                  _focus: '{colors.blue.400}',
                  _active: '{colors.blue.500}',
                  _hover: {
                    base: '{colors.blue.600}',
                    _light: '{colors.blue.700}',
                    _dark: '{colors.blue.800}',
                  }
                }
              },
            },
          },
        },
        spacing: {
          layout: {
            default: {
              sm: { value: '{spacing.9}' },
              md: { value: '{spacing.10}' },
              lg: { value: '{spacing.12}' },
            },
            internal: {
              sm: { value: '{spacing.3}' },
              md: { value: '{spacing.4}' },
              lg: { value: '{spacing.5}' },
            },
            section: {
              sm: { value: '{spacing.6}' },
              md: { value: '{spacing.8}' },
              lg: { value: '{spacing.10}' },
            },
          },
          gap: {
            component: {
              sm: { value: '{spacing.4}' },
              md: { value: '{spacing.5}' },
              lg: { value: '{spacing.6}' },
            },
            inline: {
              xs: { value: '{spacing.2}' },
              sm: { value: '{spacing.3}' },
              md: { value: '{spacing.4}' },
              lg: { value: '{spacing.5}' },
            },
          },
          padding: {
            block: {
              sm: { value: '{spacing.1}' },
              md: { value: '{spacing.2}' },
              lg: { value: '{spacing.3}' },
            },
            inline: {
              xs: { value: '{spacing.1}' },
              sm: { value: '{spacing.2}' },
              md: { value: '{spacing.3}' },
              lg: { value: '{spacing.4}' },
            },
          },
        }
      },
    },
  },

  // The output directory for your css system
  outdir: 'styled-system',

  // The JSX framework to use
  jsxFramework: 'react',
})
