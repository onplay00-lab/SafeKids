import { requireNativeModule, Platform } from 'expo-modules-core';

interface AppUsage {
  packageName: string;
  totalTimeInForeground: number; // milliseconds
}

const isAndroid = Platform.OS === 'android';

let UsageStats: any = null;
try {
  if (isAndroid) {
    UsageStats = requireNativeModule('ExpoUsageStats');
  }
} catch (e) {
  console.warn('ExpoUsageStats module not available:', e);
}

export async function checkPermission(): Promise<boolean> {
  if (!isAndroid || !UsageStats) return false;
  return await UsageStats.checkPermission();
}

export async function requestPermission(): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.requestPermission();
}

export async function getUsageStats(
  startTime: number,
  endTime: number
): Promise<AppUsage[]> {
  if (!isAndroid || !UsageStats) return [];
  return await UsageStats.getUsageStats(startTime, endTime);
}

// ============ 상시 모니터링 서비스 (네이티브 FGS) ============

export interface MonitoringConfig {
  dailyLimitMinutes?: number;
  blockedPackages?: string[];
  lockMessage?: string;
  blockMessage?: string;
}

// 상시 감시 시작. 이후 한도 체크/잠금/자정 해제는 네이티브 서비스가
// 앱 생존 여부와 무관하게 수행한다 (재부팅 후에도 자동 복원).
export async function startMonitoring(): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.startMonitoring();
}

export async function stopMonitoring(): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.stopMonitoring();
}

export async function setMonitoringConfig(config: MonitoringConfig): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.setMonitoringConfig(JSON.stringify(config));
}

// 네이티브 tick이 계산해 둔 오늘 사용량(초)
export async function getNativeUsage(): Promise<{ usageSeconds: number; usageDate: string } | null> {
  if (!isAndroid || !UsageStats) return null;
  return await UsageStats.getNativeUsage();
}

// ============ 배터리 최적화 예외 (OEM 백그라운드 킬 방지) ============

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isAndroid || !UsageStats) return true;
  return await UsageStats.isIgnoringBatteryOptimizations();
}

export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.requestIgnoreBatteryOptimizations();
}

// 오버레이 관련 함수
export async function checkOverlayPermission(): Promise<boolean> {
  if (!isAndroid || !UsageStats) return false;
  return await UsageStats.checkOverlayPermission();
}

export async function requestOverlayPermission(): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.requestOverlayPermission();
}

export async function showLockOverlay(message: string): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.showLockOverlay(message);
}

export async function hideLockOverlay(): Promise<void> {
  if (!isAndroid || !UsageStats) return;
  await UsageStats.hideLockOverlay();
}

export async function isLocked(): Promise<boolean> {
  if (!isAndroid || !UsageStats) return false;
  return await UsageStats.isLocked();
}

export async function getBatteryLevel(): Promise<number> {
  if (!isAndroid || !UsageStats) return -1;
  return await UsageStats.getBatteryLevel();
}

export async function isCharging(): Promise<boolean> {
  if (!isAndroid || !UsageStats) return false;
  return await UsageStats.isCharging();
}
