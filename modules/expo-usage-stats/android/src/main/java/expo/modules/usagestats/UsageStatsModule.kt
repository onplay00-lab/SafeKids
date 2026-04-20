package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UsageStatsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoUsageStats")

        AsyncFunction("checkPermission") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager

            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName
                )
            }

            mode == AppOpsManager.MODE_ALLOWED
        }

        AsyncFunction("requestPermission") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            null
        }

        AsyncFunction("getUsageStats") { startTime: Long, endTime: Long ->
            val context = appContext.reactContext
                ?: return@AsyncFunction emptyList<Map<String, Any>>()

            val usageStatsManager =
                context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            // queryUsageStats(INTERVAL_BEST)는 Samsung 등 일부 OEM에서 어제 daily bucket이
            // 오늘 쿼리에 유출되는 문제가 있음. queryEvents로 실제 ACTIVITY_RESUMED/PAUSED
            // 이벤트를 페어링해서 정확한 구간별 사용량을 직접 계산.
            val totals = mutableMapOf<String, Long>()
            val activeStart = mutableMapOf<String, Long>()

            try {
                val events = usageStatsManager.queryEvents(startTime, endTime)
                val event = UsageEvents.Event()

                while (events.hasNextEvent()) {
                    events.getNextEvent(event)
                    val pkg = event.packageName ?: continue
                    when (event.eventType) {
                        // MOVE_TO_FOREGROUND=1 (ACTIVITY_RESUMED from API 29)
                        UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                            activeStart[pkg] = event.timeStamp
                        }
                        // MOVE_TO_BACKGROUND=2 (ACTIVITY_PAUSED from API 29)
                        UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                            // PAUSE without prior RESUME in range: 구간 시작 시점부터 포그라운드였다고 가정
                            val start = activeStart[pkg] ?: startTime
                            val duration = event.timeStamp - start
                            if (duration > 0) {
                                totals[pkg] = (totals[pkg] ?: 0) + duration
                            }
                            activeStart.remove(pkg)
                        }
                    }
                }

                // endTime 시점에도 포그라운드 상태인 앱 처리
                for ((pkg, start) in activeStart) {
                    val duration = endTime - start
                    if (duration > 0) {
                        totals[pkg] = (totals[pkg] ?: 0) + duration
                    }
                }
            } catch (e: Exception) {
                // queryEvents 실패 시 빈 결과 반환 (기존 Firestore 값 유지)
                return@AsyncFunction emptyList<Map<String, Any>>()
            }

            val result = mutableListOf<Map<String, Any>>()
            for ((pkg, ms) in totals) {
                if (ms > 0) {
                    result.add(
                        mapOf(
                            "packageName" to pkg,
                            "totalTimeInForeground" to ms
                        )
                    )
                }
            }

            result
        }

        // 오버레이 권한 확인
        AsyncFunction("checkOverlayPermission") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        // 오버레이 권한 요청
        AsyncFunction("requestOverlayPermission") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            }
            null
        }

        // 잠금 오버레이 표시
        AsyncFunction("showLockOverlay") { message: String ->
            val context = appContext.reactContext ?: return@AsyncFunction null
            // 잠금 상태 저장 (부팅 후 복원용)
            val prefs = context.getSharedPreferences("safekids_lock", Context.MODE_PRIVATE)
            val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
            prefs.edit().putBoolean("locked", true).putString("message", message).putString("lockDate", today).apply()

            val intent = Intent(context, LockOverlayService::class.java).apply {
                action = LockOverlayService.ACTION_SHOW
                putExtra(LockOverlayService.EXTRA_MESSAGE, message)
            }
            context.startForegroundService(intent)
            null
        }

        // 잠금 오버레이 해제
        AsyncFunction("hideLockOverlay") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            // 잠금 상태 해제
            val prefs = context.getSharedPreferences("safekids_lock", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("locked", false).apply()

            val intent = Intent(context, LockOverlayService::class.java).apply {
                action = LockOverlayService.ACTION_HIDE
            }
            context.startForegroundService(intent)
            null
        }

        // 잠금 상태 확인
        AsyncFunction("isLocked") {
            LockOverlayService.isShowing
        }

        // 배터리 잔량 확인
        AsyncFunction("getBatteryLevel") {
            val context = appContext.reactContext ?: return@AsyncFunction -1
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        }

        // 충전 중인지 확인
        AsyncFunction("isCharging") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            batteryManager.isCharging
        }
    }
}
