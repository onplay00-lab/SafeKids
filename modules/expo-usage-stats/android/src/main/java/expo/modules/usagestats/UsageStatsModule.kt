package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
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
            val context = appContext.reactContext ?: return@AsyncFunction
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        AsyncFunction("getUsageStats") { startTime: Long, endTime: Long ->
            val context = appContext.reactContext
                ?: return@AsyncFunction emptyList<Map<String, Any>>()

            val usageStatsManager =
                context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            val stats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                startTime,
                endTime
            )

            val result = mutableListOf<Map<String, Any>>()

            if (stats != null) {
                for (stat in stats) {
                    if (stat.totalTimeInForeground > 0) {
                        result.add(
                            mapOf(
                                "packageName" to stat.packageName,
                                "totalTimeInForeground" to stat.totalTimeInForeground
                            )
                        )
                    }
                }
            }

            result
        }
    }
}
