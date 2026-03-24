package expo.modules.usagestats

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // 부팅 후 앱이 필요 시 잠금 서비스를 다시 시작할 수 있도록
            // SharedPreferences에서 잠금 상태를 확인
            val prefs = context.getSharedPreferences("safekids_lock", Context.MODE_PRIVATE)
            val shouldLock = prefs.getBoolean("locked", false)
            if (shouldLock) {
                val serviceIntent = Intent(context, LockOverlayService::class.java).apply {
                    action = LockOverlayService.ACTION_SHOW
                    putExtra(LockOverlayService.EXTRA_MESSAGE, prefs.getString("message", "사용 시간이 끝났어요"))
                }
                context.startForegroundService(serviceIntent)
            }
        }
    }
}
