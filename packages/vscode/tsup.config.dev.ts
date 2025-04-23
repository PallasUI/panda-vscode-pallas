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
    entry: ['src/index.ts', 'src/server.ts'],
    format: ['cjs'],
    external: ['vscode', 'esbuild', 'lightningcss'],
    minify: false,
    outDir: 'dist',
    clean: false,
    shims: true,
    sourcemap: true,
    watch: true,
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
    ]
  },
]) 