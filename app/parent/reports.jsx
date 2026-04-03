import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { fetchDailyHistory, fetchEmotionHistory, computeStats, CATEGORY_COLORS, CATEGORY_LABELS } from '../../src/services/reportService';

const CHILD_COLORS = [
  { color: Colors.primaryLight, textColor: Colors.primary },
  { color: '#FBEAF0', textColor: '#72243E' },
  { color: '#EAF3DE', textColor: '#27500A' },
];

export default function ParentReports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'ko';
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [period, setPeriod] = useState(7);
  const [history, setHistory] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  function fmt(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h > 0 ? `${h}${t('common.hour')} ${mm}${t('common.min')}` : `${mm}${t('common.min')}`;
  }

  // 자녀 목록 로드
  useEffect(() => {
    if (!familyId) return;
    (async () => {
      try {
        const famDoc = await getDoc(doc(db, 'families', familyId));
        if (!famDoc.exists()) return;
        const data = famDoc.data();
        const uids = data.children || [];
        const names = data.childNames || {};
        const list = await Promise.all(uids.map(async (uid, i) => {
          let name = names[uid];
          if (!name) {
            const userDoc = await getDoc(doc(db, 'users', uid));
            name = userDoc.exists() ? (userDoc.data().name || userDoc.data().email?.split('@')[0]) : uid;
          }
          const colors = CHILD_COLORS[i % CHILD_COLORS.length];
          return { uid, name, ...colors };
        }));
        setChildren(list);
      } catch (err) {
        console.error('[Reports] 자녀 로딩 오류:', err);
      }
    })();
  }, [familyId]);

  // 선택된 자녀 uid (안전하게 추출)
  const selectedChildUid = children[selectedIdx]?.uid;
  const selectedChildName = children[selectedIdx]?.name;

  // 데이터 로드
  useEffect(() => {
    if (!familyId || !selectedChildUid) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [hist, emo] = await Promise.all([
          fetchDailyHistory(familyId, selectedChildUid, period),
          fetchEmotionHistory(familyId, selectedChildUid, period),
        ]);
        if (cancelled) return;
        setHistory(hist);
        setEmotions(emo);
        setStats(computeStats(hist));
      } catch (err) {
        console.error('[Reports] 데이터 로딩 오류:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [familyId, selectedChildUid, period]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{t('parent.reports.title')}</Text>

      {/* 자녀 선택 */}
      {children.length > 1 && (
        <View style={s.childTabs}>
          {children.map((c, i) => (
            <TouchableOpacity
              key={c.uid}
              style={[s.childTab, i === selectedIdx && s.childTabActive]}
              onPress={() => setSelectedIdx(i)}
            >
              <Text style={[s.childTabText, i === selectedIdx && s.childTabTextActive]} numberOfLines={1}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 기간 선택 */}
      <View style={s.periodRow}>
        {[7, 14, 30].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.periodBtn, period === p && s.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodText, period === p && s.periodTextActive]}>
              {t(`parent.reports.period${p}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 데이터 없음 */}
      {!loading && (!stats || history.length === 0) && (
        <View style={s.emptyCard}>
          <Text style={s.emptyIcon}>📊</Text>
          <Text style={s.emptyTitle}>{t('parent.reports.noData')}</Text>
          <Text style={s.emptyDesc}>{t('parent.reports.noDataDesc')}</Text>
        </View>
      )}

      {/* 요약 통계 */}
      {stats && history.length > 0 && (
        <>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{t('parent.reports.avgUsage')}</Text>
              <Text style={s.statValue}>{fmt(stats.avg)}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{t('parent.reports.maxUsage')}</Text>
              <Text style={[s.statValue, { color: '#E65100' }]}>{fmt(stats.max)}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{t('parent.reports.minUsage')}</Text>
              <Text style={[s.statValue, { color: Colors.safe }]}>{fmt(stats.min)}</Text>
            </View>
          </View>

          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{t('parent.reports.overLimit')}</Text>
              <Text style={[s.statValue, stats.daysOverLimit > 0 && { color: Colors.danger }]}>
                {stats.daysOverLimit}{t('parent.reports.days')}
              </Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{t('parent.reports.trend')}</Text>
              <Text style={s.statValue}>
                {stats.trend === 'up' ? t('parent.reports.trendUp') : stats.trend === 'down' ? t('parent.reports.trendDown') : t('parent.reports.trendStable')}
              </Text>
            </View>
            {stats.mostUsedApp && (
              <View style={s.statCard}>
                <Text style={s.statLabel}>{t('parent.reports.mostUsedApp')}</Text>
                <Text style={s.statValueSmall} numberOfLines={1}>{stats.mostUsedApp}</Text>
                <Text style={s.statSub}>{fmt(stats.mostUsedMin)}</Text>
              </View>
            )}
          </View>

          {/* 일별 차트 (간단한 바 차트) */}
          <View style={s.card}>
            <Text style={s.cardLabel}>{t('parent.reports.dailyChart')}</Text>
            {(() => {
              const maxVal = Math.max(...history.map(d => d.totalUsage || d.dailyUsage || 0), 1);
              return history.slice(-7).map((d, i) => {
                const usage = d.totalUsage || d.dailyUsage || 0;
                const pct = Math.round((usage / maxVal) * 100);
                return (
                  <View key={d.date || i} style={s.chartRow}>
                    <Text style={s.chartDate}>{(d.date || '').slice(5)}</Text>
                    <View style={s.chartBarBg}>
                      <View style={[s.chartBarFill, { width: `${Math.max(pct, 2)}%` }]} />
                    </View>
                    <Text style={s.chartValue}>{fmt(usage)}</Text>
                  </View>
                );
              });
            })()}
          </View>

          {/* 앱 카테고리 */}
          {stats.appUsage && Object.keys(stats.appUsage).length > 0 && (
            <View style={s.card}>
              <Text style={s.cardLabel}>{t('parent.reports.appCategories')}</Text>
              {Object.entries(stats.appUsage)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, mins]) => (
                  <View key={cat} style={s.catRow}>
                    <View style={[s.catDot, { backgroundColor: CATEGORY_COLORS[cat] || '#94A3B8' }]} />
                    <Text style={s.catName}>{t(`parent.reports.category.${cat}`)}</Text>
                    <Text style={s.catTime}>{fmt(mins)}</Text>
                  </View>
                ))}
            </View>
          )}
        </>
      )}

      {/* 감정 타임라인 */}
      <View style={s.card}>
        <Text style={s.cardLabel}>{t('parent.reports.moodTimeline')}</Text>
        {emotions.length === 0 ? (
          <Text style={s.notiText}>{t('parent.reports.noEmotions')}</Text>
        ) : (
          <View style={s.emoRow}>
            {emotions.slice(-14).map((e, i) => (
              <View key={e.id || i} style={s.emoItem}>
                <Text style={s.emoEmoji}>{e.emoji || '😐'}</Text>
                <Text style={s.emoDate}>{(e.date || '').slice(5)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 30 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  childTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  childTab: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.bg, alignItems: 'center' },
  childTabActive: { backgroundColor: Colors.primaryLight, borderWidth: 1.5, borderColor: Colors.primary },
  childTabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  childTabTextActive: { color: Colors.primary, fontWeight: '600' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: Colors.bg },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  periodTextActive: { color: Colors.white, fontWeight: '600' },
  emptyCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 30, alignItems: 'center', marginTop: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 11, color: Colors.textHint, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  statValueSmall: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  statSub: { fontSize: 10, color: Colors.textHint, marginTop: 2 },
  card: { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginTop: 12 },
  cardLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10, fontWeight: '600' },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  chartDate: { width: 40, fontSize: 11, color: Colors.textHint },
  chartBarBg: { flex: 1, height: 14, backgroundColor: Colors.border, borderRadius: 7, overflow: 'hidden' },
  chartBarFill: { height: 14, backgroundColor: Colors.primary, borderRadius: 7 },
  chartValue: { width: 55, fontSize: 11, color: Colors.textSecondary, textAlign: 'right' },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  catName: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  catTime: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  notiText: { fontSize: 13, color: Colors.textSecondary },
  emoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emoItem: { alignItems: 'center', width: 40 },
  emoEmoji: { fontSize: 20 },
  emoDate: { fontSize: 9, color: Colors.textHint, marginTop: 2 },
});
