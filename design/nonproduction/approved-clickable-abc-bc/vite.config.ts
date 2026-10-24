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
  preview:{host:'127.0.0.1',strictPort:true,port:4174,headers:{'Content-Security-Policy':"default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'none'; script-src 'self'; style-src 'self' 'sha256-6kJHBrMeYPjuL963zk84BmND3Z4cszEoZMFiRK2nkPY='; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'none'; worker-src 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}},
  build:{outDir:'dist',emptyOutDir:true,sourcemap:false}
})