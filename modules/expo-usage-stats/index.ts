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
