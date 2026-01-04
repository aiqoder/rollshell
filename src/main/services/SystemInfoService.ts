import si from 'systeminformation'
import type { SystemStats } from '../../shared'

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

/**
 * 获取当前系统负载信息（CPU/内存/交换）
 */
export async function getSystemStats(): Promise<SystemStats> {
  const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])

  // `systeminformation` 的字段为 currentLoad / avgLoad（驼峰）
  let cpuLoad = load.currentLoad

  // 如果总负载不可用或为 0，尝试用各核心平均或 loadavg 作为兜底
  if (!Number.isFinite(cpuLoad) || cpuLoad === 0) {
    const coreLoads = (load.cpus ?? [])
      .map((c) => c.load)
      .filter((v) => Number.isFinite(v) && v >= 0)
    if (coreLoads.length > 0) {
      cpuLoad = coreLoads.reduce((acc, v) => acc + v, 0) / coreLoads.length
    } else if (Number.isFinite(load.avgLoad) && (load.cpus?.length ?? 0) > 0) {
      cpuLoad = (load.avgLoad / (load.cpus?.length ?? 1)) * 100
    }
  }

  const cpu = clampPercent(cpuLoad)

  const memoryUsed = mem.total > 0 ? ((mem.total - mem.available) / mem.total) * 100 : 0
  const memory = clampPercent(memoryUsed)

  const swapUsed = mem.swaptotal > 0 ? ((mem.swaptotal - mem.swapfree) / mem.swaptotal) * 100 : 0
  const swap = clampPercent(swapUsed)

  return { cpu, memory, swap }
}

