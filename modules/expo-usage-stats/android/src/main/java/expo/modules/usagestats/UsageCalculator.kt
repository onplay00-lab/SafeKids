// UsageEvents 기반 사용시간 계산 공용 로직.
// UsageStatsModule(JS 쿼리)과 MonitoringService(네이티브 감시 tick)가 함께 사용한다.
// 쿼리 구간보다 앞서 시작된 세션을 잡기 위해 lookback 후 [startTime, endTime]으로 클램프.
package expo.modules.usagestats

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

object UsageCalculator {

    // UsageEvents 상수 (일부 SDK 버전에서 심볼 미제공이라 정수 리터럴 사용)
    private const val SCREEN_NON_INTERACTIVE = 16
    private const val KEYGUARD_SHOWN = 17
    private const val ACTIVITY_STOPPED = 23
    private const val DEVICE_SHUTDOWN = 26

    // 자정(쿼리 시작) 이전에 시작해 계속 사용 중인 세션을 잡기 위한 lookback
    private const val LOOKBACK_MS = 4 * 60 * 60 * 1000L

    class Result(
        val totals: Map<String, Long>,   // 패키지별 [startTime, endTime] 구간 내 사용 ms
        val foregroundPackage: String?   // endTime 시점 포그라운드로 추정되는 패키지
    )

    fun calculate(context: Context, startTime: Long, endTime: Long): Result {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

        val totals = mutableMapOf<String, Long>()
        // 패키지별 세션 시작 시각 + 현재 resumed 상태인 액티비티 집합
        val sessionStart = mutableMapOf<String, Long>()
        val resumedActivities = mutableMapOf<String, MutableSet<String>>()

        // 세션을 [startTime, endTime]으로 클램프해서 합산
        fun closeSession(pkg: String, start: Long, end: Long) {
            val s = maxOf(start, startTime)
            val e = minOf(end, endTime)
            if (e > s) totals[pkg] = (totals[pkg] ?: 0) + (e - s)
        }

        // 화면 OFF/잠금/종료/앱 전환 시 모든 활성 세션을 닫는 헬퍼
        // (삼성 One UI는 MOVE_TO_BACKGROUND 누락이 흔함 → 과대 측정 방지)
        fun closeAllSessions(atTime: Long) {
            for ((pkg, start) in sessionStart) closeSession(pkg, start, atTime)
            sessionStart.clear()
            resumedActivities.clear()
        }

        try {
            val events = usm.queryEvents(startTime - LOOKBACK_MS, endTime)
            val event = UsageEvents.Event()

            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val pkg = event.packageName
                val type = event.eventType
                val ts = event.timeStamp
                val cls = event.className ?: "-"

                if (type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    if (pkg != null) {
                        // 한 번에 한 앱만 활성으로 강제 (삼성 분할화면/이벤트 누락 대응):
                        // 다른 앱이 올라오면 기존 활성 세션들은 이 시점에 종료
                        if (sessionStart.isNotEmpty() && !sessionStart.containsKey(pkg)) {
                            closeAllSessions(ts)
                        }
                        val acts = resumedActivities.getOrPut(pkg) { mutableSetOf() }
                        acts.add(cls)
                        if (!sessionStart.containsKey(pkg)) sessionStart[pkg] = ts
                    }
                } else if (type == UsageEvents.Event.MOVE_TO_BACKGROUND ||
                           type == ACTIVITY_STOPPED) {
                    if (pkg != null) {
                        // 같은 앱 내 액티비티 전환으로 세션이 끊기지 않도록
                        // 액티비티 단위로 추적하고, 전부 내려갔을 때만 세션 종료
                        val acts = resumedActivities[pkg]
                        if (acts != null) {
                            acts.remove(cls)
                            if (acts.isEmpty()) {
                                val start = sessionStart.remove(pkg)
                                if (start != null) closeSession(pkg, start, ts)
                                resumedActivities.remove(pkg)
                            }
                        }
                    }
                } else if (type == SCREEN_NON_INTERACTIVE ||
                           type == KEYGUARD_SHOWN ||
                           type == DEVICE_SHUTDOWN) {
                    // 화면 OFF/잠금/종료 — 모든 활성 세션 종료
                    closeAllSessions(ts)
                }
            }
        } catch (e: Exception) {
            // queryEvents 실패 시 빈 결과 반환 (호출부에서 기존 값 유지)
            return Result(emptyMap(), null)
        }

        // endTime 시점에도 열려 있는 세션 = 현재 포그라운드 후보
        val foreground = sessionStart.maxByOrNull { it.value }?.key
        closeAllSessions(endTime)

        return Result(totals, foreground)
    }

    fun startOfTodayMs(): Long {
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    fun todayString(): String {
        return java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
            .format(java.util.Date())
    }
}
