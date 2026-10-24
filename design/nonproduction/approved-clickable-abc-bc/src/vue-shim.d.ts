// TypeScript source-only checker: no new npm packages; Vite separately compiles actual .vue SFC files.
declare module '*.vue' {
 import type { DefineComponent } from 'vue'
 const component: DefineComponent<{}, {}, any>
 export default component
}
