// Expo 네이티브 모듈 진입점. 사용량 조회/권한/모니터링 서비스 제어/배터리 API를 JS에 노출한다.
// 사용량 계산은 UsageCalculator, 잠금·감시는 MonitoringService가 담당.
package expo.modules.usagestats

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

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

            val calc = UsageCalculator.calculate(context, startTime, endTime)

            val result = mutableListOf<Map<String, Any>>()
            for ((pkg, ms) in calc.totals) {
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

        // ============ 모니터링 서비스 제어 ============

        // 상시 감시 시작 (아이 기기). 상태는 prefs에 저장되어 재부팅/프로세스 킬에도 복원.
        AsyncFunction("startMonitoring") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            MonitoringService.prefs(context).edit()
                .putBoolean("monitoringEnabled", true)
                .apply()
            MonitoringService.start(context, MonitoringService.ACTION_START)
            null
        }

        AsyncFunction("stopMonitoring") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            MonitoringService.prefs(context).edit()
                .putBoolean("monitoringEnabled", false)
                .putBoolean("manualLocked", false)
                .apply()
            MonitoringService.start(context, MonitoringService.ACTION_STOP)
            null
        }

        // 감시 설정 갱신. JSON: { dailyLimitMinutes, blockedPackages, lockMessage, blockMessage }
        AsyncFunction("setMonitoringConfig") { configJson: String ->
            val context = appContext.reactContext ?: return@AsyncFunction null
            try {
                val json = JSONObject(configJson)
                val editor = MonitoringService.prefs(context).edit()

                if (json.has("dailyLimitMinutes")) {
                    editor.putInt("dailyLimitMinutes", json.getInt("dailyLimitMinutes"))
                }
                if (json.has("blockedPackages")) {
                    editor.putString("blockedPackages", json.getJSONArray("blockedPackages").toString())
                }
                if (json.has("lockMessage")) {
                    editor.putString("lockMessage", json.getString("lockMessage"))
                }
                if (json.has("blockMessage")) {
                    editor.putString("blockMessage", json.getString("blockMessage"))
                }
                editor.apply()

                // 모니터링 중이면 즉시 반영
                if (MonitoringService.prefs(context).getBoolean("monitoringEnabled", false)) {
                    MonitoringService.start(context, MonitoringService.ACTION_TICK)
                }
            } catch (e: Exception) {}
            null
        }

        // 네이티브 tick이 계산해 둔 오늘 사용량(초). JS가 Firestore 동기화에 활용 가능.
        AsyncFunction("getNativeUsage") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            val p = MonitoringService.prefs(context)
            mapOf(
                "usageSeconds" to p.getLong("usageSeconds", 0),
                "usageDate" to (p.getString("usageDate", null) ?: "")
            )
        }

        // ============ 오버레이 권한 ============

        AsyncFunction("checkOverlayPermission") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

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

        // ============ 배터리 최적화 예외 (삼성 등 OEM의 백그라운드 킬 방지) ============

        AsyncFunction("isIgnoringBatteryOptimizations") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(context.packageName)
        }

        AsyncFunction("requestIgnoreBatteryOptimizations") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            try {
                @Suppress("BatteryLife")
                val intent = Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:${context.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } catch (e: Exception) {
                // 일부 기기에서 다이얼로그 미지원 → 설정 목록 화면으로 폴백
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                } catch (e2: Exception) {}
            }
            null
        }

        // ============ 잠금 오버레이 (수동 제어) ============

        AsyncFunction("showLockOverlay") { message: String ->
            val context = appContext.reactContext ?: return@AsyncFunction null
            MonitoringService.start(context, MonitoringService.ACTION_SHOW, message)
            null
        }

        AsyncFunction("hideLockOverlay") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            MonitoringService.start(context, MonitoringService.ACTION_HIDE)
            null
        }

        AsyncFunction("isLocked") {
            MonitoringService.isShowing
        }

        // ============ 배터리 상태 ============

        AsyncFunction("getBatteryLevel") {
            val context = appContext.reactContext ?: return@AsyncFunction -1
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        }

        AsyncFunction("isCharging") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            batteryManager.isCharging
        }
    }
}
