package expo.modules.usagestats

import android.app.*
import android.content.Context
import android.content.Intent
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LockOverlayService : Service() {

    companion object {
        const val CHANNEL_ID = "safekids_lock"
        const val NOTIFICATION_ID = 1001
        const val ACTION_SHOW = "SHOW_OVERLAY"
        const val ACTION_HIDE = "HIDE_OVERLAY"
        const val EXTRA_MESSAGE = "message"

        var isShowing = false
    }

    private var overlayView: LinearLayout? = null
    private var windowManager: WindowManager? = null
    private var midnightHandler: Handler? = null
    private var midnightRunnable: Runnable? = null
    private var lockDate: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)

        when (intent?.action) {
            ACTION_SHOW -> {
                // 잠금 날짜 기록 및 자정 체크 시작
                val prefs = getSharedPreferences("safekids_lock", Context.MODE_PRIVATE)
                lockDate = prefs.getString("lockDate", null)
                    ?: SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                showOverlay(intent.getStringExtra(EXTRA_MESSAGE) ?: "사용 시간이 끝났어요")
                startMidnightCheck()
            }
            ACTION_HIDE -> {
                stopMidnightCheck()
                hideOverlay()
            }
        }

        return START_STICKY
    }

    /** 30초마다 날짜가 바뀌었는지 체크 → 바뀌면 자동 해제 */
    private fun startMidnightCheck() {
        stopMidnightCheck()
        midnightHandler = Handler(Looper.getMainLooper())
        midnightRunnable = object : Runnable {
            override fun run() {
                val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                if (lockDate != null && lockDate != today) {
                    // 자정이 지남 → 잠금 해제
                    val prefs = getSharedPreferences("safekids_lock", Context.MODE_PRIVATE)
                    prefs.edit().putBoolean("locked", false).remove("lockDate").apply()
                    hideOverlay()
                    return
                }
                midnightHandler?.postDelayed(this, 30_000L)
            }
        }
        midnightHandler?.postDelayed(midnightRunnable!!, 30_000L)
    }

    private fun stopMidnightCheck() {
        midnightRunnable?.let { midnightHandler?.removeCallbacks(it) }
        midnightHandler = null
        midnightRunnable = null
    }

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
        val iconView = TextView(this).apply {
            text = "\u23F0" // ⏰
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 64f)
            gravity = Gravity.CENTER
        }
        layout.addView(iconView)

        // 타이틀
        val titleView = TextView(this).apply {
            text = "오늘 사용 시간이\n끝났어요!"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = 40
            layoutParams = lp
        }
        layout.addView(titleView)

        // 메시지
        val msgView = TextView(this).apply {
            text = message
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTextColor(Color.parseColor("#CCCCCC"))
            gravity = Gravity.CENTER
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = 24
            layoutParams = lp
        }
        layout.addView(msgView)

        // 안내 텍스트
        val hintView = TextView(this).apply {
            text = "부모님이 추가 시간을 승인하면\n자동으로 해제됩니다"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(Color.parseColor("#999999"))
            gravity = Gravity.CENTER
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = 40
            layoutParams = lp
        }
        layout.addView(hintView)

        overlayView = layout

        try {
            windowManager?.addView(overlayView, params)
        } catch (e: Exception) {
            isShowing = false
        }
    }

    private fun hideOverlay() {
        try {
            if (overlayView != null) {
                windowManager?.removeView(overlayView)
                overlayView = null
            }
        } catch (e: Exception) {}
        isShowing = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopMidnightCheck()
        hideOverlay()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SafeKids 사용 시간 관리",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "사용 시간 초과 알림"
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
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
