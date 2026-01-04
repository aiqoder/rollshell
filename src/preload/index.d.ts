import { ElectronAPI } from '@electron-toolkit/preload'
import type { ShellToolAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    shellTool?: ShellToolAPI
  }
}
