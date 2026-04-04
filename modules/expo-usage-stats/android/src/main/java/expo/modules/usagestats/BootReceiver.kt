package expo.modules.usagestats

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences("safekids_lock", Context.MODE_PRIVATE)
            val shouldLock = prefs.getBoolean("locked", false)
            if (shouldLock) {
                // 잠금 날짜가 오늘이 아니면 잠금 해제 (자정 지남)
                val lockDate = prefs.getString("lockDate", null)
                val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
                if (lockDate != null && lockDate != today) {
                    prefs.edit().putBoolean("locked", false).remove("lockDate").apply()
                    return
                }

                val serviceIntent = Intent(context, LockOverlayService::class.java).apply {
                    action = LockOverlayService.ACTION_SHOW
                    putExtra(LockOverlayService.EXTRA_MESSAGE, prefs.getString("message", "사용 시간이 끝났어요"))
                }
                context.startForegroundService(serviceIntent)
            }
        }
    }
}
