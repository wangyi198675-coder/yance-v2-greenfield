import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  resolve:{ alias:[
    {find: /^@\/registry\/bases\/reka\/ui\//, replacement: fileURLToPath(new URL('./src/components/oss/', import.meta.url)).replace(/\\/g,'/')},
    {find: /^@\/lib\/utils$/, replacement: fileURLToPath(new URL('./src/lib/utils.ts', import.meta.url))},
    {find: /^@\//, replacement: fileURLToPath(new URL('./src/',import.meta.url)).replace(/\\/g,'/') + '/'}
  ]},
  server:{host:'127.0.0.1',strictPort:true,port:4173},
  preview:{host:'127.0.0.1',strictPort:true,port:4174},
  build:{outDir:'dist',emptyOutDir:true,sourcemap:false}
})