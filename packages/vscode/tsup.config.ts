import path from 'node:path'
import { defineConfig } from 'tsup'

const aliases = {
  '@vue/compiler-sfc': '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js',
  lightningcss: 'lightningcss-wasm/index.mjs',
}

const nodeModulesPath = path.resolve(__dirname, 'node_modules')



export default defineConfig([
  // Extension entry point
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    external: ['vscode', 'esbuild', 'lightningcss'],
    minify: true,
    outDir: 'dist',
    clean: true,
    shims: true,
    sourcemap: true,
    esbuildOptions(options) {
      options.target = 'es2020'
    },
    esbuildPlugins: [
      {
        name: 'resolve-alias-plugin',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            for (const alias in aliases) {
              if (args.path.startsWith(alias)) {
                const updated = path.resolve(nodeModulesPath, aliases[alias as keyof typeof aliases])

                return { path: updated }
              }
            }
            return null
          })
        },
      },
    ],
  },
  // Server entry point
  {
    entry: ['src/server.ts'],
    format: ['cjs'],
    external: ['vscode', 'esbuild', 'lightningcss'],
    minify: true,
    outDir: 'dist',
    shims: true,
    sourcemap: true,
  },
])
