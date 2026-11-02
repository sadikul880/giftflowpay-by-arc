import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// The app only uses the injected-wallet connector, but wagmi's connector bundle lazy-imports these
// wallet SDKs. Resolving them to an empty module keeps ~1 GB of parsing out of production builds so
// small CI and Coolify servers do not run out of memory. They are never loaded at runtime.
const UNUSED_WALLET_SDKS = [
  '@walletconnect/ethereum-provider',
  '@coinbase/wallet-sdk',
  '@metamask/sdk',
  '@base-org/account',
  '@safe-global/safe-apps-provider',
  '@safe-global/safe-apps-sdk',
  'cbw-sdk',
  'porto',
]
const STUB_ID = 'virtual:unused-wallet-sdk'
const stubWalletSdks = (): Plugin => ({
  name: 'stub-unused-wallet-sdks',
  apply: 'build',
  enforce: 'pre',
  resolveId: (id) => (UNUSED_WALLET_SDKS.some((p) => id === p || id.startsWith(`${p}/`)) ? STUB_ID : undefined),
  load: (id) => (id === STUB_ID ? 'export default {}' : undefined),
})

export default defineConfig({
  plugins: [stubWalletSdks(), react(), nodePolyfills()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  build: {
    reportCompressedSize: false,
    rollupOptions: { shimMissingExports: true },
  },
  server: {
    allowedHosts: true,
    cors: true,
  },
})
