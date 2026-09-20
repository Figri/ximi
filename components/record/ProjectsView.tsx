import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addProjectLog, fetchProjectLogs, fetchProjects, updateProjectStatus } from '../../lib/projects';
import { fetchWorries } from '../../lib/worries';
import { useCardStore } from '../../lib/store';
import type { Project, ProjectLog, ProjectStatus, Worry } from '../../types';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: '想法',
  active: '进行中',
  paused: '暂停',
  done: '完成',
};
const STATUS_ORDER: ProjectStatus[] = ['idea', 'active', 'paused', 'done'];
const STATUS_COLOR: Record<ProjectStatus, string> = {
  idea: colors.textMuted,
  active: colors.greenDark,
  paused: colors.yellowDark,
  done: colors.purpleDark,
};

export function ProjectsView({ refreshKey }: { refreshKey: number }) {
  const { cards, fetchAll } = useCardStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [worries, setWorries] = useState<Worry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
    load();
  }, [refreshKey]);

  async function load() {
    setLoading(true);
    try {
      const [p, w] = await Promise.all([fetchProjects(), fetchWorries()]);
      setProjects(p);
      setWorries(w);
    } finally {
      setLoading(false);
    }
  }

  async function handleCycleStatus(project: Project) {
    const nextIndex = (STATUS_ORDER.indexOf(project.status) + 1) % STATUS_ORDER.length;
    const nextStatus = STATUS_ORDER[nextIndex];
    try {
      await updateProjectStatus(project.id, nextStatus);
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: nextStatus } : p)));
    } catch (err) {
      Alert.alert('改状态失败', err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />;

  if (projects.length === 0) {
    return <Text style={styles.empty}>还没有项目，点右下角 ＋ 建一个吧</Text>;
  }

  return (
    <View>
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          cards={cards}
          worries={worries}
          expanded={expanded === project.id}
          onToggle={() => setExpanded((v) => (v === project.id ? null : project.id))}
          onCycleStatus={() => handleCycleStatus(project)}
        />
      ))}
    </View>
  );
}

function ProjectCard({
  project,
  cards,
  worries,
  expanded,
  onToggle,
  onCycleStatus,
}: {
  project: Project;
  cards: { id: string; name: string }[];
  worries: Worry[];
  expanded: boolean;
  onToggle: () => void;
  onCycleStatus: () => void;
}) {
  const [logs, setLogs] = useState<ProjectLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [logInput, setLogInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expanded && !logsLoaded) {
      fetchProjectLogs(project.id).then((rows) => {
        setLogs(rows);
        setLogsLoaded(true);
      });
    }
  }, [expanded, logsLoaded]);

  async function handleAddLog() {
    if (!logInput.trim()) return;
    setSaving(true);
    try {
      const log = await addProjectLog(project.id, logInput.trim());
      setLogs((prev) => [log, ...prev]);
      setLogInput('');
    } catch (err) {
      Alert.alert('记日志失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const linkedCards = cards.filter((c) => project.linked_card_ids?.includes(c.id));
  const linkedWorries = worries.filter((w) => project.linked_worry_ids?.includes(w.id));

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardHeader} onPress={onToggle}>
        <Text style={styles.name}>{project.name}</Text>
        <Pressable onPress={onCycleStatus} style={[styles.statusPill, { backgroundColor: STATUS_COLOR[project.status] }]}>
          <Text style={styles.statusText}>{STATUS_LABEL[project.status]}</Text>
        </Pressable>
      </Pressable>
      {project.description ? <Text style={styles.description}>{project.description}</Text> : null}

      {(linkedCards.length > 0 || linkedWorries.length > 0) && (
        <View style={styles.linkRow}>
          {linkedCards.map((c) => (
            <Pressable key={c.id} style={styles.linkChip} onPress={() => router.push(`/card/${c.id}`)}>
              <Text style={styles.linkChipText}>📌 {c.name}</Text>
            </Pressable>
          ))}
          {linkedWorries.map((w) => (
            <View key={w.id} style={styles.linkChip}>
              <Text style={styles.linkChipText} numberOfLines={1}>
                😮‍💨 {w.content}
              </Text>
            </View>
          ))}
        </View>
      )}

      {expanded && (
        <View style={styles.logsArea}>
          <View style={styles.logInputRow}>
            <TextInput
              style={styles.logInput}
              value={logInput}
              onChangeText={setLogInput}
              placeholder="记一笔进展…"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable style={styles.logAddButton} onPress={handleAddLog} disabled={saving}>
              <Text style={styles.logAddButtonText}>{saving ? '…' : '记'}</Text>
            </Pressable>
          </View>
          {logs.length === 0 ? (
            <Text style={styles.noLogs}>还没有日志</Text>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Text style={styles.logDate}>{new Date(log.created_at).toLocaleDateString('zh-CN')}</Text>
                <Text style={styles.logContent}>{log.content}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.button },
  statusText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '600' },
  description: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.xs },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  linkChip: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: 200,
  },
  linkChipText: { fontSize: fontSize.tiny, color: colors.textSecondary },
  logsArea: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.background, paddingTop: spacing.sm },
  logInputRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  logInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: fontSize.secondary,
    color: colors.textPrimary,
  },
  logAddButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  logAddButtonText: { color: '#fff', fontSize: fontSize.secondary, fontWeight: '600' },
  noLogs: { fontSize: fontSize.secondary, color: colors.textMuted },
  logRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 4 },
  logDate: { fontSize: fontSize.tiny, color: colors.textMuted, width: 68 },
  logContent: { fontSize: fontSize.secondary, color: colors.textSecondary, flex: 1 },
});
