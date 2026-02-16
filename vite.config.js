import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "@mui/material": path.resolve(__dirname, "node_modules/@mui/material"),
      "@mui/system": path.resolve(__dirname, "node_modules/@mui/system"),
      "@mui/icons-material": path.resolve(__dirname, "node_modules/@mui/icons-material"),
      "@emotion/react": path.resolve(__dirname, "node_modules/@emotion/react"),
      "@emotion/styled": path.resolve(__dirname, "node_modules/@emotion/styled"),
    },
    dedupe: [
      "react",
      "react-dom",
      "@mui/material",
      "@mui/system",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
    ],
  },

  // Vite options tailored for Tauri development
  clearScreen: false,

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 3000,
    strictPort: true,
    host: "localhost",
  },

  // to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.app/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ["VITE_", "TAURI_"],

  build: {
    // Tauri supports es2021
    target: ["es2021", "chrome100", "safari13"],
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "build",
  },

  // Configure esbuild to treat .js files as JSX
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },

  // Optimize dependencies to avoid pre-bundling issues
  optimizeDeps: {
    include: [
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
      "@tauri-apps/plugin-dialog",
    ],
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
      include: [
        "src/components/QueryHistory.js",
        "src/components/QueryEditor.js",
        "src/components/ResultViewer.js",
      ],
      exclude: [
        "src/App.js",
        "src/index.js",
        "src/components/LeftPanelFixed.js",
      ],
    },
  },
});
