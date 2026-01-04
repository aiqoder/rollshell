/// <reference types="vite/client" />

declare module '@heroicons/vue/24/outline' {
  import type { FunctionalComponent, SVGAttributes } from 'vue'
  export const PlugIcon: FunctionalComponent<SVGAttributes>
  export const FolderIcon: FunctionalComponent<SVGAttributes>
  export const ServerIcon: FunctionalComponent<SVGAttributes>
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
