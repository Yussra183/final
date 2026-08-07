import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'treat-js-files-as-jsx',
      async transform(code: string, id: string) {
        if (id.includes('node_modules') && id.endsWith('.js') && code.includes('<')) {
          const res = await transformWithEsbuild(code, id, {
            loader: 'jsx',
            jsx: 'automatic',
          });
          return { code: res.code, map: res.map as any };
        }
        return null;
      },
    },
    react(),
  ],
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
  },
  define: {
    'process.env': {},
    global: 'window',
    __DEV__: JSON.stringify(true),
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
      resolveExtensions: [
        '.web.tsx',
        '.web.ts',
        '.web.jsx',
        '.web.js',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
        '.json',
      ],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
