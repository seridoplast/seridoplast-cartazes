import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative URLs allow deployment both at a custom domain and in a GitHub Pages subpath.
export default defineConfig({ plugins: [react()], base: './' })
