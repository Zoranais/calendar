import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';
import { dts } from 'rollup-plugin-dts';
import path from 'path';
import fs from 'fs';
import postcssParser from 'postcss';

const DAYFLOW_SCOPE_SELECTOR = '.df-calendar-container';

function scopeDayflowSelector(selector) {
  const trimmedSelector = selector.trim();

  if (!trimmedSelector || trimmedSelector.includes('&')) {
    return selector;
  }

  const rootScopedSelector = trimmedSelector.replace(
    /:root|:host/g,
    DAYFLOW_SCOPE_SELECTOR
  );

  if (rootScopedSelector !== trimmedSelector) {
    return rootScopedSelector;
  }

  if (trimmedSelector.includes(DAYFLOW_SCOPE_SELECTOR)) {
    return trimmedSelector;
  }

  if (trimmedSelector.startsWith('.dark ')) {
    return `.dark ${DAYFLOW_SCOPE_SELECTOR} ${trimmedSelector.slice(6)}`;
  }

  if (trimmedSelector.startsWith('.light ')) {
    return `.light ${DAYFLOW_SCOPE_SELECTOR} ${trimmedSelector.slice(7)}`;
  }

  return `${DAYFLOW_SCOPE_SELECTOR} ${trimmedSelector}`;
}

function scopeDayflowStylesheetAsset() {
  return {
    name: 'scope-dayflow-stylesheet-asset',
    generateBundle(_, bundle) {
      let hasProcessedStylesheet = false;

      Object.values(bundle).forEach(item => {
        if (item.type !== 'asset' || !item.fileName.endsWith('styles.css')) {
          return;
        }

        const cssSource =
          typeof item.source === 'string'
            ? item.source
            : Buffer.from(item.source).toString('utf8');

        const root = postcssParser.parse(cssSource);

        root.walkRules(rule => {
          if (!rule.selectors || rule.selectors.length === 0) {
            return;
          }

          if (
            rule.parent?.type === 'atrule' &&
            /keyframes$/i.test(rule.parent.name)
          ) {
            return;
          }

          rule.selectors = rule.selectors.map(scopeDayflowSelector);
        });

        item.source = root.toString();
        hasProcessedStylesheet = true;
      });

      if (!hasProcessedStylesheet) {
        this.warn('scope-dayflow-stylesheet-asset: no styles.css asset found');
      }
    },
  };
}

function emitConsumerSourceStylesheet() {
  return {
    name: 'emit-consumer-source-stylesheet',
    generateBundle() {
      const consumerSourcePath = path.resolve(
        './src/styles/tailwind.consumer.css'
      );
      const baseSourcePath = path.resolve('./src/styles/base.css');
      const consumerStylesheet = fs.readFileSync(consumerSourcePath, 'utf8');
      const baseStylesheet = fs.readFileSync(baseSourcePath, 'utf8');

      const bundledConsumerStylesheet = consumerStylesheet.replace(
        /@import\s+['"]\.\/base\.css['"];?/g,
        `\n${baseStylesheet}\n`
      );

      this.emitFile({
        type: 'asset',
        fileName: 'styles.source.css',
        source: bundledConsumerStylesheet,
      });
    },
  };
}

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
        sourcemap: false,
        exports: 'named',
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: false,
        exports: 'named',
      },
    ],
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true,
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        alias: {
          '@': path.resolve('./src'),
        },
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        exclude: [
          'src/app/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
        ],
      }),
      postcss({
        extensions: ['.css'],
        minimize: false,
        inject: false,
        extract: 'styles.css',
        config: {
          path: './postcss.build.js',
        },
        use: {
          sass: false,
          stylus: false,
          less: false,
        },
      }),
      emitConsumerSourceStylesheet(),
      scopeDayflowStylesheetAsset(),
      terser(),
      visualizer({
        filename: 'bundle-analysis.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
    ],
    external: [
      'preact',
      'preact/hooks',
      'preact/compat',
      'temporal-polyfill',
      'tslib',
      '@dayflow/blossom-color-picker',
    ],
  },
  {
    input: 'dist/types/index.d.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts()],
    external: [/\.css$/],
  },
];
