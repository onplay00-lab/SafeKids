import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { fetchDailyHistory, fetchEmotionHistory, computeStats, CATEGORY_COLORS } from '../../src/services/reportService';
import { subscribeBehaviorAlerts, ALERT_ICONS, SEVERITY_COLORS } from '../../src/services/behaviorAnalysisService';

export default function ParentReports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'ko';
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [period, setPeriod] = useState(7); // 7 or 30
  const [history, setHistory] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);

  function fmt(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h > 0 ? `${h}${t('common.hour')} ${mm}${t('common.min')}` : `${mm}${t('common.min')}`;
  }

  // 자녀 목록 로드
  useEffect(() => {
    if (!familyId) return;
    (async () => {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const data = famDoc.data();
      const uids = data.children || [];
      const names = data.childNames || {};
      const list = await Promise.all(uids.map(async (uid) => {
        if (names[uid]) return { uid, name: names[uid] };
        const userDoc = await getDoc(doc(db, 'users', uid));
        return { uid, name: userDoc.exists() ? (userDoc.data().name || userDoc.data().email?.split('@')[0]) : uid };
      }));
      setChildren(list);
    })();
  }, [familyId]);

  const selectedChild = children[selectedIdx];

  // 데이터 로드
  useEffect(() => {
    if (!familyId || !selectedChild) return;
    (async () => {
      try {
        const [hist, emo] = await Promise.all([
          fetchDailyHistory(familyId, selectedChild.uid, period),
          fetchEmotionHistory(familyId, selectedChild.uid, period),
        ]);
        setHistory(hist);
        setEmotions(emo);
        setStats(computeStats(hist));
      } catch (e) {
        console.error('[리포트 데이터 로드 실패]', e);
      }
    })();
  }, [familyId, selectedChild?.uid, period]);

  // 행동 알림 구독
  useEffect(() => {
    if (!familyId || !selectedChild) return;
    try {
      return subscribeBehaviorAlerts(familyId, selectedChild.uid, setAlerts);
    } catch (e) {
      console.error('[행동알림 구독 실패]', e);
    }
  }, [familyId, selectedChild?.uid]);

  const maxUsage = history.length > 0 ? Math.max(...history.map(d => d.totalUsage || d.dailyUsage || 0), 60) : 240;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{t('reports.title')}</Text>

      {/* 자녀 선택 */}
      {children.length > 1 && (
        <View style={s.tabs}>
          {children.map((c, i) => (
            <TouchableOpacity key={c.uid} style={[s.tab, i === selectedIdx && s.tabActive]} onPress={() => setSelectedIdx(i)}>
              <Text style={[s.tabText, i === selectedIdx && s.tabTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 기간 선택 */}
      <View style={s.periodRow}>
        {[7, 14, 30].map(p => (
          <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodBtnActive]} onPress={() => setPeriod(p)}>
            <Text style={[s.periodText, period === p && s.periodTextActive]}>{p}{t('reports.days')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 요약 통계 */}
      {stats && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('reports.summary')}</Text>
          <View style={s.statsGrid}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{fmt(stats.avg)}</Text>
              <Text style={s.statLabel}>{t('reports.avgUsage')}</Text>
            </View>
            <View style={s.statItem}>
              <Text style={s.statValue}>{fmt(stats.max)}</Text>
              <Text style={s.statLabel}>{t('reports.maxUsage')}</Text>
            </View>
            <View style={s.statItem}>
              <Text style={[s.statValue, stats.daysOverLimit > 0 && { color: Colors.danger }]}>{stats.daysOverLimit}{t('reports.daysUnit')}</Text>
              <Text style={s.statLabel}>{t('reports.daysOverLimit')}</Text>
            </View>
            <View style={s.statItem}>
              <Text style={s.statValue}>{stats.trend === 'up' ? '📈' : stats.trend === 'down' ? '📉' : '➡️'}</Text>
              <Text style={s.statLabel}>{t(`reports.trend.${stats.trend}`)}</Text>
            </View>
          </View>
          {stats.mostUsedApp && (
            <Text style={s.mostUsed}>{t('reports.mostUsedApp')}: {stats.mostUsedApp} ({fmt(stats.mostUsedMin)})</Text>
          )}
        </View>
      )}

      {/* 일별 사용량 차트 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>{t('reports.dailyChart')}</Text>
        <View style={s.chartArea}>
          {history.map((d, i) => {
            const usage = d.totalUsage || d.dailyUsage || 0;
            const limitVal = d.dailyLimit || 240;
            const pct = Math.min(100, Math.round((usage / maxUsage) * 100));
            const overLimit = usage > limitVal;
            const dateStr = (d.date || d.id || '').slice(-5); // MM-DD
            return (
              <View key={i} style={s.barItem}>
                <Text style={s.barValue}>{usage > 0 ? Math.round(usage / 60 * 10) / 10 + 'h' : ''}</Text>
                <View style={s.barBg}>
                  <View style={[s.barFill, { height: `${pct}%`, backgroundColor: overLimit ? Colors.danger : Colors.primary }]} />
                </View>
                <Text style={s.barLabel}>{dateStr}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 앱 카테고리 */}
      {stats?.appUsage && Object.keys(stats.appUsage).length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('reports.appCategories')}</Text>
          {Object.entries(stats.appUsage)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, mins]) => {
              const total = Object.values(stats.appUsage).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((mins / total) * 100) : 0;
              return (
                <View key={cat} style={s.catRow}>
                  <View style={[s.catDot, { backgroundColor: CATEGORY_COLORS[cat] || '#ccc' }]} />
                  <Text style={s.catName}>{t(`reports.cat.${cat}`)}</Text>
                  <View style={s.catBarBg}>
                    <View style={[s.catBarFill, { width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] || '#ccc' }]} />
                  </View>
                  <Text style={s.catPct}>{pct}%</Text>
                  <Text style={s.catTime}>{fmt(mins)}</Text>
                </View>
              );
            })}
        </View>
      )}

      {/* 감정 타임라인 */}
      {emotions.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('reports.moodTrend')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.moodRow}>
              {emotions.map((e, i) => (
                <View key={i} style={s.moodItem}>
                  <Text style={s.moodEmoji}>{e.emoji}</Text>
                  <Text style={s.moodDate}>{(e.date || '').slice(-5)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 행동 알림 */}
      {alerts.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('reports.behaviorAlerts')}</Text>
          {alerts.slice(0, 10).map(a => {
            const sc = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.info;
            return (
              <View key={a.id} style={[s.alertRow, { backgroundColor: sc.bg }]}>
                <Text style={s.alertIcon}>{ALERT_ICONS[a.type] || '📋'}</Text>
                <View style={s.alertInfo}>
                  <Text style={[s.alertTitle, { color: sc.text }]}>{a.title}</Text>
                  <Text style={s.alertDesc}>{a.description}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.bg, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.primaryLight, borderWidth: 1.5, borderColor: Colors.primary },
  tabText: { fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Colors.bg },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 13, color: Colors.textSecondary },
  periodTextActive: { fontSize: 13, color: Colors.white, fontWeight: '600' },
  card: { backgroundColor: Colors.bg, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statItem: { width: '45%', alignItems: 'center', paddingVertical: 8 },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  mostUsed: { fontSize: 12, color: Colors.textSecondary, marginTop: 10, textAlign: 'center' },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 120 },
  barItem: { alignItems: 'center', flex: 1 },
  barValue: { fontSize: 9, color: Colors.textHint, marginBottom: 4 },
  barBg: { width: 20, height: 90, backgroundColor: Colors.border, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  catName: { fontSize: 12, color: Colors.textPrimary, width: 60 },
  catBarBg: { flex: 1, height: 8, backgroundColor: Colors.border, borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 4 },
  catPct: { fontSize: 11, color: Colors.textSecondary, width: 32, textAlign: 'right' },
  catTime: { fontSize: 11, color: Colors.textHint, width: 50, textAlign: 'right' },
  moodRow: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  moodItem: { alignItems: 'center' },
  moodEmoji: { fontSize: 24 },
  moodDate: { fontSize: 10, color: Colors.textHint, marginTop: 4 },
  alertRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6 },
  alertIcon: { fontSize: 20, marginRight: 10 },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 13, fontWeight: '600' },
  alertDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
