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
