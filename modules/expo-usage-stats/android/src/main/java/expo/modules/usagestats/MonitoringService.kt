// 상시 실행 포그라운드 서비스. 30초마다(+화면 켜질 때) 네이티브에서 직접 오늘 사용량을
// 계산해 한도 초과/차단 앱이면 잠금 오버레이를 표시하고, 자정이 지나면 자동 해제한다.
// 모든 상태는 SharedPreferences("safekids_lock") 기반이라 프로세스 킬/재부팅 후에도 복원된다.
// (기존 LockOverlayService의 오버레이 표시 역할을 흡수)
package expo.modules.usagestats

import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.json.JSONArray

class MonitoringService : Service() {

    companion object {
        const val CHANNEL_ID = "safekids_lock"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "START_MONITORING"
        const val ACTION_STOP = "STOP_MONITORING"
        const val ACTION_TICK = "TICK"
        const val ACTION_SHOW = "SHOW_OVERLAY"   // 수동 잠금 (JS showLockOverlay)
        const val ACTION_HIDE = "HIDE_OVERLAY"   // 수동 잠금 해제 (JS hideLockOverlay)
        const val EXTRA_MESSAGE = "message"

        const val PREFS_NAME = "safekids_lock"

        // 잠금 중에도 전화 수신/긴급통화는 막지 않는다
        private val DIALER_WHITELIST = setOf(
            "com.android.dialer", "com.google.android.dialer",
            "com.samsung.android.dialer", "com.android.incallui",
            "com.samsung.android.incallui", "com.android.emergency",
            "com.android.systemui",
        )

        private const val TICK_NORMAL_MS = 30_000L
        // 잠금 조건인데 오버레이가 숨겨진 상태(아이가 SafeKids 안)에서는 짧게 체크
        private const val TICK_FAST_MS = 5_000L

        var isShowing = false

        fun prefs(context: Context) =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        fun start(context: Context, action: String, message: String? = null) {
            val intent = Intent(context, MonitoringService::class.java).apply {
                this.action = action
                if (message != null) putExtra(EXTRA_MESSAGE, message)
            }
            context.startForegroundService(intent)
        }
    }

    private var overlayView: LinearLayout? = null
    private var windowManager: WindowManager? = null
    private var handler: Handler? = null
    private var tickRunnable: Runnable? = null
    private var screenReceiver: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        handler = Handler(Looper.getMainLooper())
        createNotificationChannel()

        // 화면이 켜지면 즉시 체크 (자정 지난 아침 첫 사용 시 바로 해제되도록)
        screenReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == Intent.ACTION_SCREEN_ON) tick()
            }
        }
        registerReceiver(screenReceiver, IntentFilter(Intent.ACTION_SCREEN_ON))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        val p = prefs(this)
        when (intent?.action) {
            ACTION_STOP -> {
                hideOverlay()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SHOW -> {
                p.edit()
                    .putBoolean("manualLocked", true)
                    .putString("lockDate", UsageCalculator.todayString())
                    .putString("lockMessage", intent.getStringExtra(EXTRA_MESSAGE) ?: "사용 시간이 끝났어요")
                    .apply()
            }
            ACTION_HIDE -> {
                p.edit().putBoolean("manualLocked", false).apply()
            }
            // ACTION_START, ACTION_TICK, null(START_STICKY 재시작) → 아래 공통 tick.
            // 상태가 전부 prefs에 있어서 null intent여도 완전 복원된다.
        }

        tick()
        return START_STICKY
    }

    /** 핵심 체크 루프. 모든 판단을 prefs + 실시간 계산으로 수행한다. */
    private fun tick() {
        cancelScheduledTick()

        val p = prefs(this)
        val enabled = p.getBoolean("monitoringEnabled", false)
        var manualLocked = p.getBoolean("manualLocked", false)
        val today = UsageCalculator.todayString()

        // 자정이 지났으면 수동 잠금 해제
        if (manualLocked && p.getString("lockDate", null) != today) {
            manualLocked = false
            p.edit().putBoolean("manualLocked", false).remove("lockDate").apply()
        }

        // 모니터링도 꺼져 있고 수동 잠금도 없으면 서비스 유지 불필요
        if (!enabled && !manualLocked) {
            hideOverlay()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }

        var overLimit = false
        var blockedApp = false
        var foreground: String? = null

        if (enabled) {
            val now = System.currentTimeMillis()
            val result = UsageCalculator.calculate(this, UsageCalculator.startOfTodayMs(), now)
            foreground = result.foregroundPackage

            val totalMs = result.totals.values.sum()
            // JS(앱이 열려 있을 때)가 읽어서 Firestore에 동기화할 수 있도록 저장
            p.edit()
                .putLong("usageSeconds", totalMs / 1000)
                .putString("usageDate", today)
                .apply()

            val limitMinutes = p.getInt("dailyLimitMinutes", -1)
            overLimit = limitMinutes > 0 && totalMs >= limitMinutes * 60_000L

            if (foreground != null) {
                try {
                    val arr = JSONArray(p.getString("blockedPackages", "[]"))
                    for (i in 0 until arr.length()) {
                        if (arr.getString(i) == foreground) { blockedApp = true; break }
                    }
                } catch (e: Exception) {}
            }
        }

        var wantLock = manualLocked || overLimit || blockedApp
        // SafeKids 자체는 막지 않음 (아이가 추가 시간을 요청할 통로)
        if (foreground == packageName) wantLock = false
        // 전화/긴급통화는 막지 않음
        if (foreground != null && DIALER_WHITELIST.contains(foreground)) wantLock = false

        if (wantLock) {
            val message = if (blockedApp && !overLimit && !manualLocked) {
                p.getString("blockMessage", null) ?: "이 앱은 지금 사용할 수 없어요"
            } else {
                p.getString("lockMessage", null) ?: "사용 시간이 끝났어요"
            }
            showOverlay(message)
        } else {
            hideOverlayViewOnly()
        }

        // 다음 tick 예약: 잠금 조건인데 오버레이가 내려가 있으면 짧은 주기로 감시
        val lockPending = (overLimit || manualLocked) && !isShowing
        scheduleTick(if (lockPending) TICK_FAST_MS else TICK_NORMAL_MS)
    }

    private fun scheduleTick(delayMs: Long) {
        val r = Runnable { tick() }
        tickRunnable = r
        handler?.postDelayed(r, delayMs)
    }

    private fun cancelScheduledTick() {
        tickRunnable?.let { handler?.removeCallbacks(it) }
        tickRunnable = null
    }

    // ============ 오버레이 ============

    private fun showOverlay(message: String) {
        if (isShowing) return
        isShowing = true

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.CENTER

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F0151530"))
            setPadding(60, 60, 60, 60)
        }

        // 시계 아이콘
        layout.addView(TextView(this).apply {
            text = "⏰" // ⏰
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 64f)
            gravity = Gravity.CENTER
        })

        // 타이틀
        layout.addView(TextView(this).apply {
            text = "오늘 사용 시간이\n끝났어요!"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = 40 }
        })

        // 메시지
        layout.addView(TextView(this).apply {
            text = message
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTextColor(Color.parseColor("#CCCCCC"))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = 24 }
        })

        // SafeKids 열기 버튼 (추가 시간 요청 통로)
        layout.addView(TextView(this).apply {
            text = "SafeKids 열기"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#4A6CF7"))
            setPadding(70, 30, 70, 30)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = 48 }
            setOnClickListener { openSafeKids() }
        })

        // 안내 텍스트
        layout.addView(TextView(this).apply {
            text = "부모님이 추가 시간을 승인하면\n자동으로 해제됩니다"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(Color.parseColor("#999999"))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = 40 }
        })

        overlayView = layout

        try {
            windowManager?.addView(overlayView, params)
        } catch (e: Exception) {
            // 오버레이 권한 없음 등
            overlayView = null
            isShowing = false
        }
    }

    private fun openSafeKids() {
        // 오버레이 뷰만 내리고 (서비스/모니터링은 유지) SafeKids를 연다.
        // SafeKids가 포그라운드인 동안은 tick이 오버레이를 다시 올리지 않는다.
        hideOverlayViewOnly()
        try {
            val launch = packageManager.getLaunchIntentForPackage(packageName)
            launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (launch != null) startActivity(launch)
        } catch (e: Exception) {}
        // 곧바로 빠른 감시 모드로 전환
        cancelScheduledTick()
        scheduleTick(TICK_FAST_MS)
    }

    /** 오버레이 뷰만 제거 (서비스는 계속 실행) */
    private fun hideOverlayViewOnly() {
        try {
            if (overlayView != null) {
                windowManager?.removeView(overlayView)
            }
        } catch (e: Exception) {}
        overlayView = null
        isShowing = false
    }

    /** 오버레이 제거 (서비스 종료 직전용) */
    private fun hideOverlay() {
        hideOverlayViewOnly()
        cancelScheduledTick()
    }

    override fun onDestroy() {
        cancelScheduledTick()
        hideOverlayViewOnly()
        try { screenReceiver?.let { unregisterReceiver(it) } } catch (e: Exception) {}
        screenReceiver = null
        super.onDestroy()
    }

    // ============ 알림 ============

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SafeKids 사용 시간 관리",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "사용 시간 관리 알림" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SafeKids")
            .setContentText("사용 시간 관리 중")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
}
