import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

type ThemePreference = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'shell-tool-theme'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>('light')
  const systemTheme = ref<ResolvedTheme>(getSystemTheme())
  const initialized = ref(false)
  let mediaQuery: MediaQueryList | null = null

  const resolvedTheme = computed<ResolvedTheme>(() => {
    return preference.value === 'system' ? systemTheme.value : preference.value
  })

  function handleSystemChange(event: MediaQueryListEvent): void {
    systemTheme.value = event.matches ? 'dark' : 'light'
    if (preference.value === 'system') {
      applyTheme(resolvedTheme.value)
    }
  }

  function setupSystemWatcher(): void {
    if (typeof window === 'undefined') return
    if (mediaQuery) return
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', handleSystemChange)
    systemTheme.value = mediaQuery.matches ? 'dark' : 'light'
  }

  function loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return
    const saved = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      preference.value = saved
    }
  }

  function persistPreference(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, preference.value)
  }

  function setThemePreference(theme: ThemePreference): void {
    preference.value = theme
    persistPreference()
    if (theme === 'system') {
      setupSystemWatcher()
    }
    applyTheme(resolvedTheme.value)
  }

  function cycleThemePreference(): void {
    const order: ThemePreference[] = ['light', 'dark', 'system']
    const currentIndex = order.indexOf(preference.value)
    const nextIndex = (currentIndex + 1) % order.length
    setThemePreference(order[nextIndex])
  }

  function initTheme(): void {
    if (initialized.value) return
    loadFromStorage()
    if (preference.value === 'system') {
      setupSystemWatcher()
    }
    applyTheme(resolvedTheme.value)
    initialized.value = true
  }

  function getTerminalTheme(): {
    background: string
    foreground: string
    cursor: string
    cursorAccent: string
    selectionBackground: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
  } {
    if (resolvedTheme.value === 'dark') {
      return {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#f8f8f2',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#44475a',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2'
      }
    }
    return {
      background: '#f8fafc',
      foreground: '#0f172a',
      cursor: '#1f2937',
      cursorAccent: '#f8fafc',
      selectionBackground: '#c7d2fe',
      black: '#0f172a',
      red: '#dc2626',
      green: '#15803d',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#7c3aed',
      cyan: '#0891b2',
      white: '#f8fafc'
    }
  }

  return {
    themePreference: preference,
    resolvedTheme,
    initTheme,
    setThemePreference,
    cycleThemePreference,
    getTerminalTheme
  }
})

