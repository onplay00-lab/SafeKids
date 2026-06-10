// 부팅 완료 시 모니터링 서비스를 재시작한다. 잠금 복원/자정 해제 판단은
// MonitoringService의 첫 tick이 prefs + 실시간 사용량 계산으로 수행한다.
package expo.modules.usagestats

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON") return

        val prefs = MonitoringService.prefs(context)
        val enabled = prefs.getBoolean("monitoringEnabled", false)
        val manualLocked = prefs.getBoolean("manualLocked", false)

        if (enabled || manualLocked) {
            try {
                MonitoringService.start(context, MonitoringService.ACTION_TICK)
            } catch (e: Exception) {}
        }
    }
}
