import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import type { MemoFilterMode, MemoSortMode } from "@edgeever/client";
import {
  Archive,
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  Folder,
  HardDrive,
  History,
  Home,
  Image as ImageIcon,
  LogOut,
  Merge,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Tag,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image as RNImage,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MemoDetail, MemoRevision, MemoSummary, Notebook, ResourceListItem, TagSummary } from "@edgeever/shared";
import { useSession } from "../lib/session";

const ALL_NOTES_ID = "all";
const DEFAULT_MEMO_TITLE = "无标题笔记";
const MEMO_TEMPLATES: MemoTemplate[] = [
  {
    id: "quick-note",
    title: "速记",
    description: "适合临时记录想法、链接和灵感。",
    contentMarkdown: "## 速记\n\n- \n\n## 后续动作\n\n- [ ] ",
    tags: ["template", "quick-note"],
  },
  {
    id: "meeting",
    title: "会议记录",
    description: "议题、结论和待办放在同一页。",
    contentMarkdown: "## 会议记录\n\n时间：\n参与人：\n\n## 议题\n\n- \n\n## 结论\n\n- \n\n## 待办\n\n- [ ] ",
    tags: ["template", "meeting"],
  },
  {
    id: "checklist",
    title: "清单",
    description: "快速列出待办、采购、项目检查项。",
    contentMarkdown: "## 清单\n\n- [ ] \n- [ ] \n- [ ] ",
    tags: ["template", "checklist"],
  },
  {
    id: "reading",
    title: "读书笔记",
    description: "摘录、观点和下一步阅读整理。",
    contentMarkdown: "## 读书笔记\n\n书名：\n作者：\n\n## 摘录\n\n> \n\n## 我的观点\n\n\n## 延伸问题\n\n- ",
    tags: ["template", "reading"],
  },
  {
    id: "daily",
    title: "每日复盘",
    description: "记录今天完成了什么、卡在哪里。",
    contentMarkdown: "## 每日复盘\n\n## 今天完成\n\n- \n\n## 遇到的问题\n\n- \n\n## 明天优先级\n\n- [ ] ",
    tags: ["template", "daily"],
  },
];

type MobileView = "notes" | "search" | "account" | "settings";
type MemoView = "notebook" | "trash";
type MemoTemplate = {
  id: string;
  title: string;
  description: string;
  contentMarkdown: string;
  tags: string[];
};

export const WorkspaceScreen = () => {
  const { client, session, signOut } = useSession();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<MobileView>("notes");
  const [activeNotebookId, setActiveNotebookId] = useState<string>(ALL_NOTES_ID);
  const [memoView, setMemoView] = useState<MemoView>("notebook");
  const [memoFilterMode, setMemoFilterMode] = useState<MemoFilterMode>("all");
  const [memoSortMode, setMemoSortMode] = useState<MemoSortMode>("updated-desc");
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<MemoDetail | null>(null);
  const [notebookManagerOpen, setNotebookManagerOpen] = useState(false);
  const [tagsManagerOpen, setTagsManagerOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [revisionMemo, setRevisionMemo] = useState<MemoDetail | null>(null);
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(() => new Set());
  const [selectionMoveOpen, setSelectionMoveOpen] = useState(false);

  const notebooksQuery = useQuery({
    queryKey: ["mobile", "notebooks"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listNotebooks();
    },
    enabled: Boolean(client),
  });

  const notebooks = notebooksQuery.data?.notebooks ?? [];
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;

  const memosQuery = useQuery({
    queryKey: ["mobile", "memos", memoView, activeNotebookId, memoFilterMode, memoSortMode],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listMemos({
        notebookId: activeNotebookId === ALL_NOTES_ID ? null : activeNotebookId,
        filter: memoFilterMode,
        limit: 50,
        sort: memoSortMode,
        trash: memoView === "trash",
      });
    },
    enabled: Boolean(client),
  });

  const searchQuery = useQuery({
    queryKey: ["mobile", "search", searchText.trim()],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listMemos({
        q: searchText.trim(),
        limit: 50,
        sort: "updated-desc",
      });
    },
    enabled: Boolean(client && searchText.trim().length > 0),
  });

  const memoDetailQuery = useQuery({
    queryKey: ["mobile", "memo", memoView, selectedMemoId],
    queryFn: async () => {
      if (!client || !selectedMemoId) {
        throw new Error("Memo is not selected");
      }

      return client.getMemo(selectedMemoId, { includeDeleted: memoView === "trash" });
    },
    enabled: Boolean(client && selectedMemoId),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
  };

  const handleMemoPress = (memoId: string) => {
    if (selectedMemoIds.size > 0) {
      toggleSelectedMemo(memoId);
      return;
    }

    setSelectedMemoId(memoId);
  };

  const toggleSelectedMemo = (memoId: string) => {
    setSelectedMemoIds((current) => {
      const next = new Set(current);

      if (next.has(memoId)) {
        next.delete(memoId);
      } else {
        next.add(memoId);
      }

      return next;
    });
  };

  const clearSelection = () => {
    setSelectedMemoIds(new Set());
    setSelectionMoveOpen(false);
  };

  const closeDetail = () => {
    setSelectedMemoId(null);
  };

  const memoCount = notebooks.reduce((total, notebook) => total + notebook.memoCount, 0);
  const memos = memosQuery.data?.memos ?? [];
  const searchResults = searchQuery.data?.memos ?? [];
  const selectedMemo = memoDetailQuery.data?.memo ?? null;
  const isRefreshing = notebooksQuery.isFetching || memosQuery.isFetching || searchQuery.isFetching || memoDetailQuery.isFetching;
  const selectedMemoIdList = Array.from(selectedMemoIds);
  const selectedMemos = memos.filter((memo) => selectedMemoIds.has(memo.id));
  const nextSelectionPinValue = selectedMemos.some((memo) => !memo.isPinned);

  useEffect(() => {
    clearSelection();
  }, [activeNotebookId, memoFilterMode, memoSortMode, memoView]);

  const invalidateWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
  };

  const updateMemoMutation = useMutation({
    mutationFn: async ({ memo, payload }: { memo: MemoDetail; payload: { title?: string; contentMarkdown?: string; isPinned?: boolean; notebookId?: string; tags?: string[] } }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.updateMemo(memo.id, {
        expectedRevision: memo.revision,
        ...payload,
      });

      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      queryClient.setQueryData(["mobile", "memo", memoView, memo.id], { memo });
    },
  });

  const deleteMemoMutation = useMutation({
    mutationFn: async ({ memo, permanent }: { memo: MemoDetail; permanent: boolean }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      await client.deleteMemo(memo.id, { permanent });
      return { memo, permanent };
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      setSelectedMemoId(null);
    },
  });

  const restoreMemoMutation = useMutation({
    mutationFn: async (memo: MemoDetail) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.restoreMemo(memo.id);
      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      setMemoView("notebook");
      setSelectedMemoId(memo.id);
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.emptyTrash();
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      setSelectedMemoId(null);
    },
  });

  const moveMemosMutation = useMutation({
    mutationFn: async ({ memoIds, notebookId }: { memoIds: string[]; notebookId: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.moveMemos({ memoIds, notebookId });
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      clearSelection();
    },
  });

  const pinMemosMutation = useMutation({
    mutationFn: async ({ memoIds, isPinned }: { memoIds: string[]; isPinned: boolean }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      await Promise.all(memoIds.map((memoId) => client.updateMemo(memoId, { isPinned })));
      return { ok: true };
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      clearSelection();
    },
  });

  const deleteMemosMutation = useMutation({
    mutationFn: async ({ memoIds, permanent }: { memoIds: string[]; permanent: boolean }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.deleteMemos({ memoIds, permanent });
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      clearSelection();
    },
  });

  const mergeMemosMutation = useMutation({
    mutationFn: async ({ memoIds, notebookId }: { memoIds: string[]; notebookId?: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.mergeMemos({ memoIds, notebookId });
      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      clearSelection();
      setSelectedMemoId(memo.id);
    },
  });

  const handleTogglePin = (memo: MemoDetail) => {
    updateMemoMutation.mutate({ memo, payload: { isPinned: !memo.isPinned } });
  };

  const handleDeleteMemo = (memo: MemoDetail) => {
    Alert.alert(memoView === "trash" ? "永久删除笔记？" : "删除笔记？", memoView === "trash" ? "此操作不可撤销。" : "笔记会移动到回收站。", [
      { text: "取消", style: "cancel" },
      {
        text: memoView === "trash" ? "永久删除" : "删除",
        style: "destructive",
        onPress: () => deleteMemoMutation.mutate({ memo, permanent: memoView === "trash" }),
      },
    ]);
  };

  const handleEmptyTrash = () => {
    Alert.alert("清空回收站？", "回收站中的笔记会被永久删除，此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: () => emptyTrashMutation.mutate(),
      },
    ]);
  };

  const handleDeleteSelection = () => {
    const permanent = memoView === "trash";

    Alert.alert(permanent ? "永久删除选中笔记？" : "删除选中笔记？", permanent ? "此操作不可撤销。" : "选中的笔记会移动到回收站。", [
      { text: "取消", style: "cancel" },
      {
        text: permanent ? "永久删除" : "删除",
        style: "destructive",
        onPress: () => deleteMemosMutation.mutate({ memoIds: selectedMemoIdList, permanent }),
      },
    ]);
  };

  const handleMergeSelection = () => {
    if (selectedMemoIdList.length < 2) {
      return;
    }

    const targetNotebookId = activeNotebookId === ALL_NOTES_ID ? selectedMemos[0]?.notebookId : activeNotebookId;

    Alert.alert("合并选中笔记？", "服务端会把选中的笔记合并成一条新笔记。", [
      { text: "取消", style: "cancel" },
      {
        text: "合并",
        onPress: () => mergeMemosMutation.mutate({ memoIds: selectedMemoIdList, notebookId: targetNotebookId }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader instance={session?.baseUrl ?? ""} onRefresh={refresh} onSignOut={signOut} />

      {activeView === "notes" ? (
        <NotesView
          activeNotebook={activeNotebook}
          activeNotebookId={activeNotebookId}
          isLoading={memosQuery.isLoading}
          isRefreshing={isRefreshing}
          memoCount={memosQuery.data?.totalCount ?? memos.length}
          memoFilterMode={memoFilterMode}
          memoSortMode={memoSortMode}
          memoView={memoView}
          memos={memos}
          notebooks={notebooks}
          notebooksMemoCount={memoCount}
          onCreate={() => setCreateOpen(true)}
          onEmptyTrash={handleEmptyTrash}
          onFilterModeChange={setMemoFilterMode}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onMemoPress={handleMemoPress}
          onMemoLongPress={toggleSelectedMemo}
          onRefresh={refresh}
          onSelectNotebook={setActiveNotebookId}
          onSetMemoView={setMemoView}
          onSortModeChange={setMemoSortMode}
          selectedMemoIds={selectedMemoIds}
          error={memosQuery.error}
          isError={memosQuery.isError}
          isEmptyingTrash={emptyTrashMutation.isPending}
        />
      ) : null}

      {activeView === "search" ? (
        <SearchView
          isLoading={searchQuery.isFetching}
          isRefreshing={isRefreshing}
          onMemoPress={handleMemoPress}
          onRefresh={refresh}
          results={searchResults}
          searchText={searchText}
          setSearchText={setSearchText}
          totalCount={searchQuery.data?.totalCount ?? searchResults.length}
        />
      ) : null}

      {activeView === "account" ? <AccountView instance={session?.baseUrl ?? ""} userName={session?.user?.username ?? "owner"} onSignOut={signOut} /> : null}
      {activeView === "settings" ? (
        <SettingsView
          notebookCount={notebooks.length}
          memoCount={memoCount}
          onOpenNotebookManager={() => setNotebookManagerOpen(true)}
          onOpenResources={() => setResourcesOpen(true)}
          onOpenTagsManager={() => setTagsManagerOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
        />
      ) : null}

      <MemoDetailModal
        isDeleting={deleteMemoMutation.isPending}
        isLoading={memoDetailQuery.isLoading}
        isRestoring={restoreMemoMutation.isPending}
        isSaving={updateMemoMutation.isPending}
        memo={selectedMemo}
        onClose={closeDetail}
        onDelete={handleDeleteMemo}
        onEdit={setEditingMemo}
        onOpenResources={() => setResourcesOpen(true)}
        onOpenRevisions={setRevisionMemo}
        onRestore={(memo) => restoreMemoMutation.mutate(memo)}
        onTogglePin={handleTogglePin}
        visible={Boolean(selectedMemoId)}
      />

      <EditMemoModal
        memo={editingMemo}
        notebooks={notebooks}
        onClose={() => setEditingMemo(null)}
        onSaved={(memo) => {
          setEditingMemo(null);
          setSelectedMemoId(memo.id);
        }}
        updateMutation={updateMemoMutation}
      />

      <NotebookManagerModal notebooks={notebooks} onClose={() => setNotebookManagerOpen(false)} visible={notebookManagerOpen} />
      <TagsManagerModal onClose={() => setTagsManagerOpen(false)} visible={tagsManagerOpen} />
      <ResourcesModal activeMemo={selectedMemo} onClose={() => setResourcesOpen(false)} visible={resourcesOpen} />
      <RevisionHistoryModal
        memo={revisionMemo}
        onClose={() => setRevisionMemo(null)}
        onRestored={(memo) => {
          setRevisionMemo(null);
          setSelectedMemoId(memo.id);
        }}
      />

      <CreateMemoModal
        activeNotebookId={activeNotebookId}
        notebooks={notebooks}
        onClose={() => setCreateOpen(false)}
        onCreated={(memo) => {
          setCreateOpen(false);
          setActiveView("notes");
          setSelectedMemoId(memo.id);
        }}
        visible={createOpen}
      />

      <TemplatesModal
        activeNotebookId={activeNotebookId}
        notebooks={notebooks}
        onClose={() => setTemplatesOpen(false)}
        onCreated={(memo) => {
          setTemplatesOpen(false);
          setActiveView("notes");
          setMemoView("notebook");
          setSelectedMemoId(memo.id);
        }}
        visible={templatesOpen}
      />

      <MoveSelectionModal
        isMoving={moveMemosMutation.isPending}
        notebooks={notebooks}
        onClose={() => setSelectionMoveOpen(false)}
        onMove={(notebookId) => moveMemosMutation.mutate({ memoIds: selectedMemoIdList, notebookId })}
        selectedCount={selectedMemoIds.size}
        visible={selectionMoveOpen}
      />

      {activeView === "notes" && selectedMemoIds.size > 0 ? (
        <SelectionActionBar
          canMerge={memoView !== "trash" && selectedMemoIds.size >= 2}
          canMove={memoView !== "trash"}
          isBusy={deleteMemosMutation.isPending || moveMemosMutation.isPending || pinMemosMutation.isPending || mergeMemosMutation.isPending}
          isTrashView={memoView === "trash"}
          onClear={clearSelection}
          onDelete={handleDeleteSelection}
          onMerge={handleMergeSelection}
          onMove={() => setSelectionMoveOpen(true)}
          onPin={() => pinMemosMutation.mutate({ memoIds: selectedMemoIdList, isPinned: nextSelectionPinValue })}
          pinLabel={nextSelectionPinValue ? "置顶" : "取消置顶"}
          selectedCount={selectedMemoIds.size}
        />
      ) : null}

      <View style={styles.bottomNav}>
        <BottomNavItem
          active={activeView === "notes"}
          icon={<Home color={activeView === "notes" ? "#0f172a" : "#64748b"} size={20} />}
          label="笔记"
          onPress={() => setActiveView("notes")}
        />
        <BottomNavItem
          active={activeView === "search"}
          icon={<Search color={activeView === "search" ? "#0f172a" : "#64748b"} size={20} />}
          label="搜索"
          onPress={() => setActiveView("search")}
        />
        <BottomNavItem
          active={activeView === "account"}
          icon={<UserRound color={activeView === "account" ? "#0f172a" : "#64748b"} size={20} />}
          label="账户"
          onPress={() => setActiveView("account")}
        />
        <BottomNavItem
          active={activeView === "settings"}
          icon={<Settings color={activeView === "settings" ? "#0f172a" : "#64748b"} size={20} />}
          label="设置"
          onPress={() => setActiveView("settings")}
        />
      </View>
    </SafeAreaView>
  );
};

const AppHeader = ({ instance, onRefresh, onSignOut }: { instance: string; onRefresh: () => void; onSignOut: () => void }) => (
  <View style={styles.header}>
    <View>
      <Text style={styles.title}>EdgeEver</Text>
      <Text numberOfLines={1} style={styles.instance}>
        {instance}
      </Text>
    </View>

    <View style={styles.headerActions}>
      <IconButton onPress={onRefresh}>
        <RefreshCw color="#0f172a" size={18} />
      </IconButton>
      <IconButton onPress={onSignOut}>
        <LogOut color="#0f172a" size={18} />
      </IconButton>
    </View>
  </View>
);

const NotesView = ({
  activeNotebook,
  activeNotebookId,
  error,
  isError,
  isLoading,
  isRefreshing,
  memoCount,
  memoFilterMode,
  memoSortMode,
  memoView,
  memos,
  notebooks,
  notebooksMemoCount,
  onCreate,
  onEmptyTrash,
  onFilterModeChange,
  onMemoLongPress,
  onMemoPress,
  onOpenTemplates,
  onRefresh,
  onSelectNotebook,
  onSetMemoView,
  onSortModeChange,
  selectedMemoIds,
  isEmptyingTrash,
}: {
  activeNotebook: Notebook | null;
  activeNotebookId: string;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  memoCount: number;
  memoFilterMode: MemoFilterMode;
  memoSortMode: MemoSortMode;
  memoView: MemoView;
  memos: MemoSummary[];
  notebooks: Notebook[];
  notebooksMemoCount: number;
  onCreate: () => void;
  onEmptyTrash: () => void;
  onFilterModeChange: (filterMode: MemoFilterMode) => void;
  onMemoLongPress: (memoId: string) => void;
  onMemoPress: (memoId: string) => void;
  onOpenTemplates: () => void;
  onRefresh: () => void;
  onSelectNotebook: (notebookId: string) => void;
  onSetMemoView: (memoView: MemoView) => void;
  onSortModeChange: (sortMode: MemoSortMode) => void;
  selectedMemoIds: Set<string>;
  isEmptyingTrash: boolean;
}) => (
  <View style={styles.viewBody}>
    {memoView === "notebook" ? (
      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <NotebookPill active={activeNotebookId === ALL_NOTES_ID} label="全部笔记" memoCount={notebooksMemoCount} onPress={() => onSelectNotebook(ALL_NOTES_ID)} />
          {notebooks.map((notebook) => (
            <NotebookPill
              active={activeNotebookId === notebook.id}
              key={notebook.id}
              label={notebook.name}
              memoCount={notebook.memoCount}
              onPress={() => onSelectNotebook(notebook.id)}
            />
          ))}
        </ScrollView>
      </View>
    ) : null}

    <View style={styles.contentHeader}>
      <View>
        <Text style={styles.sectionTitle}>{memoView === "trash" ? "回收站" : activeNotebook?.name ?? "全部笔记"}</Text>
        <Text style={styles.sectionSubtitle}>{memoCount} 条笔记</Text>
      </View>
      <View style={styles.contentActions}>
        <Pressable accessibilityRole="button" onPress={() => onSetMemoView(memoView === "trash" ? "notebook" : "trash")} style={styles.secondaryIconButton}>
          {memoView === "trash" ? <BookOpen color="#0f172a" size={18} /> : <Trash2 color="#0f172a" size={18} />}
        </Pressable>
        {memoView === "notebook" ? (
          <>
            <Pressable accessibilityRole="button" onPress={onOpenTemplates} style={styles.secondaryIconButton}>
              <FileText color="#0f172a" size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onCreate} style={styles.primaryIconButton}>
              <Plus color="#ffffff" size={20} />
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={isEmptyingTrash || memoCount === 0}
            onPress={onEmptyTrash}
            style={[styles.dangerIconButton, (isEmptyingTrash || memoCount === 0) && styles.buttonDisabled]}
          >
            <Trash2 color="#b91c1c" size={18} />
          </Pressable>
        )}
      </View>
    </View>

    {memoView === "notebook" ? (
      <View style={styles.listControls}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoFilterMode === "all"} label="全部" onPress={() => onFilterModeChange("all")} />
          <OptionPill active={memoFilterMode === "pinned"} label="置顶" onPress={() => onFilterModeChange(memoFilterMode === "pinned" ? "all" : "pinned")} />
          <OptionPill active={memoFilterMode === "tagged"} label="有标签" onPress={() => onFilterModeChange(memoFilterMode === "tagged" ? "all" : "tagged")} />
          <OptionPill active={memoFilterMode === "untagged"} label="无标签" onPress={() => onFilterModeChange(memoFilterMode === "untagged" ? "all" : "untagged")} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoSortMode === "updated-desc"} label="最近更新" onPress={() => onSortModeChange("updated-desc")} />
          <OptionPill active={memoSortMode === "created-desc"} label="创建时间" onPress={() => onSortModeChange("created-desc")} />
          <OptionPill active={memoSortMode === "title-asc"} label="标题 A-Z" onPress={() => onSortModeChange("title-asc")} />
        </ScrollView>
      </View>
    ) : null}

    <MemoList
      emptyDescription={memoView === "trash" ? "删除的笔记会出现在这里" : "点右上角按钮创建第一条笔记"}
      emptyTitle={memoView === "trash" ? "回收站为空" : "暂无笔记"}
      error={error}
      isError={isError}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      memos={memos}
      onMemoLongPress={onMemoLongPress}
      onMemoPress={onMemoPress}
      onRefresh={onRefresh}
      selectedMemoIds={selectedMemoIds}
    />
  </View>
);

const SearchView = ({
  isLoading,
  isRefreshing,
  onMemoPress,
  onRefresh,
  results,
  searchText,
  setSearchText,
  totalCount,
}: {
  isLoading: boolean;
  isRefreshing: boolean;
  onMemoPress: (memoId: string) => void;
  onRefresh: () => void;
  results: MemoSummary[];
  searchText: string;
  setSearchText: (value: string) => void;
  totalCount: number;
}) => (
  <View style={styles.viewBody}>
    <View style={styles.searchHeader}>
      <Text style={styles.sectionTitle}>搜索</Text>
      <View style={styles.searchBox}>
        <Search color="#64748b" size={18} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchText}
          placeholder="搜索标题、正文或标签"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={searchText}
        />
        {searchText ? (
          <Pressable onPress={() => setSearchText("")}>
            <X color="#64748b" size={18} />
          </Pressable>
        ) : null}
      </View>
      {searchText.trim() ? <Text style={styles.sectionSubtitle}>{totalCount} 条结果</Text> : null}
    </View>

    {searchText.trim() ? (
      <MemoList
        emptyDescription="换个关键词再试"
        emptyTitle="没有找到匹配笔记"
        isError={false}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        memos={results}
        onMemoPress={onMemoPress}
        onRefresh={onRefresh}
      />
    ) : (
      <View style={styles.centerState}>
        <Search color="#94a3b8" size={32} />
        <Text style={styles.emptyTitle}>输入关键词开始搜索</Text>
        <Text style={styles.mutedText}>搜索会请求你的 EdgeEver 实例</Text>
      </View>
    )}
  </View>
);

const AccountView = ({ instance, userName, onSignOut }: { instance: string; userName: string; onSignOut: () => void }) => (
  <ScrollView contentContainerStyle={styles.panelList} style={styles.viewBody}>
    <Text style={styles.sectionTitle}>账户</Text>
    <PanelRow label="当前用户" value={userName} />
    <PanelRow label="实例地址" value={instance} />
    <Pressable onPress={onSignOut} style={styles.dangerButton}>
      <LogOut color="#b91c1c" size={18} />
      <Text style={styles.dangerButtonText}>退出登录</Text>
    </Pressable>
  </ScrollView>
);

const SettingsView = ({
  memoCount,
  notebookCount,
  onOpenNotebookManager,
  onOpenResources,
  onOpenTagsManager,
  onOpenTemplates,
}: {
  memoCount: number;
  notebookCount: number;
  onOpenNotebookManager: () => void;
  onOpenResources: () => void;
  onOpenTagsManager: () => void;
  onOpenTemplates: () => void;
}) => (
  <ScrollView contentContainerStyle={styles.panelList} style={styles.viewBody}>
    <Text style={styles.sectionTitle}>设置</Text>
    <Pressable onPress={onOpenNotebookManager}>
      <PanelRow label="笔记本管理" value="创建、重命名、删除" />
    </Pressable>
    <Pressable onPress={onOpenTagsManager}>
      <PanelRow label="标签管理" value="重命名、删除标签" />
    </Pressable>
    <Pressable onPress={onOpenResources}>
      <PanelRow label="资源库" value="图片、附件、来源笔记" />
    </Pressable>
    <Pressable onPress={onOpenTemplates}>
      <PanelRow label="模板" value="速记、会议、清单、读书、复盘" />
    </Pressable>
    <PanelRow label="移动端形态" value="React Native" />
    <PanelRow label="笔记本数量" value={String(notebookCount)} />
    <PanelRow label="笔记总数" value={String(memoCount)} />
    <PanelRow label="离线同步" value="待接入" />
    <PanelRow label="富文本编辑器" value="待接入 WebView TipTap" />
  </ScrollView>
);

const CreateMemoModal = ({
  activeNotebookId,
  notebooks,
  onClose,
  onCreated,
  visible,
}: {
  activeNotebookId: string;
  notebooks: Notebook[];
  onClose: () => void;
  onCreated: (memo: MemoDetail) => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const fallbackNotebookId = activeNotebookId !== ALL_NOTES_ID ? activeNotebookId : notebooks[0]?.id ?? "";
  const [notebookId, setNotebookId] = useState(fallbackNotebookId);
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");

  useEffect(() => {
    if (visible) {
      setNotebookId(fallbackNotebookId);
    }
  }, [fallbackNotebookId, visible]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const targetNotebookId = notebookId || fallbackNotebookId;

      if (!targetNotebookId) {
        throw new Error("请先创建一个笔记本");
      }

      const response = await client.createMemo({
        notebookId: targetNotebookId,
        title: title.trim() || DEFAULT_MEMO_TITLE,
        contentMarkdown: contentMarkdown.trim(),
      });

      return response.memo;
    },
    onSuccess: async (memo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      ]);
      setTitle("");
      setContentMarkdown("");
      onCreated(memo);
    },
  });

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>新建笔记</Text>
          <IconButton onPress={() => createMutation.mutate()}>
            {createMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={20} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.label}>笔记本</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {notebooks.map((notebook) => (
              <NotebookPill
                active={(notebookId || fallbackNotebookId) === notebook.id}
                key={notebook.id}
                label={notebook.name}
                memoCount={notebook.memoCount}
                onPress={() => setNotebookId(notebook.id)}
              />
            ))}
          </ScrollView>

          <Text style={styles.label}>标题</Text>
          <TextInput onChangeText={setTitle} placeholder={DEFAULT_MEMO_TITLE} placeholderTextColor="#94a3b8" style={styles.titleInput} value={title} />

          <Text style={styles.label}>正文</Text>
          <TextInput
            multiline
            onChangeText={setContentMarkdown}
            placeholder="先用 Markdown 写入，后续接入移动 PWA 的 TipTap 编辑器"
            placeholderTextColor="#94a3b8"
            style={styles.markdownInput}
            textAlignVertical="top"
            value={contentMarkdown}
          />

          {createMutation.error ? (
            <Text style={styles.errorText}>{createMutation.error instanceof Error ? createMutation.error.message : "创建失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const TemplatesModal = ({
  activeNotebookId,
  notebooks,
  onClose,
  onCreated,
  visible,
}: {
  activeNotebookId: string;
  notebooks: Notebook[];
  onClose: () => void;
  onCreated: (memo: MemoDetail) => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const targetNotebookId = activeNotebookId !== ALL_NOTES_ID ? activeNotebookId : notebooks[0]?.id ?? "";

  const createFromTemplateMutation = useMutation({
    mutationFn: async (template: MemoTemplate) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      if (!targetNotebookId) {
        throw new Error("请先创建一个笔记本");
      }

      const response = await client.createMemo({
        notebookId: targetNotebookId,
        title: template.title,
        contentMarkdown: template.contentMarkdown,
        tags: template.tags,
      });

      return response.memo;
    },
    onSuccess: async (memo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "tags"] }),
      ]);
      onCreated(memo);
    },
  });

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>模板</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.sectionSubtitle}>选择一个模板，直接创建新笔记。</Text>
          {!targetNotebookId ? (
            <View style={styles.warningPanel}>
              <Text style={styles.warningText}>当前无法创建笔记，请先创建可用笔记本。</Text>
            </View>
          ) : null}
          {MEMO_TEMPLATES.map((template) => (
            <Pressable
              disabled={!targetNotebookId || createFromTemplateMutation.isPending}
              key={template.id}
              onPress={() => createFromTemplateMutation.mutate(template)}
              style={[styles.templateCard, (!targetNotebookId || createFromTemplateMutation.isPending) && styles.buttonDisabled]}
            >
              <View style={styles.templateIcon}>
                <FileText color="#047857" size={20} />
              </View>
              <View style={styles.templateText}>
                <Text style={styles.panelValue}>{template.title}</Text>
                <Text style={styles.panelLabel}>{template.description}</Text>
              </View>
              {createFromTemplateMutation.isPending ? <ActivityIndicator color="#0f172a" /> : null}
            </Pressable>
          ))}
          {createFromTemplateMutation.error ? (
            <Text style={styles.errorText}>{createFromTemplateMutation.error instanceof Error ? createFromTemplateMutation.error.message : "创建失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const NotebookManagerModal = ({ notebooks, onClose, visible }: { notebooks: Notebook[]; onClose: () => void; visible: boolean }) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const invalidateNotebooks = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
    ]);
  };

  const createNotebookMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmed = name.trim();

      if (!trimmed) {
        throw new Error("请输入笔记本名称");
      }

      return client.createNotebook({ name: trimmed });
    },
    onSuccess: async () => {
      setName("");
      await invalidateNotebooks();
    },
  });

  const renameNotebookMutation = useMutation({
    mutationFn: async ({ notebookId, nextName }: { notebookId: string; nextName: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmed = nextName.trim();

      if (!trimmed) {
        throw new Error("请输入笔记本名称");
      }

      return client.updateNotebook(notebookId, { name: trimmed });
    },
    onSuccess: async () => {
      setEditingNotebookId(null);
      setEditingName("");
      await invalidateNotebooks();
    },
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: async (notebookId: string) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.deleteNotebook(notebookId);
    },
    onSuccess: invalidateNotebooks,
  });

  const requestDeleteNotebook = (notebook: Notebook) => {
    Alert.alert("删除笔记本？", `将删除“${notebook.name}”。如果服务端不允许删除非空笔记本，请先移动或删除其中笔记。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => deleteNotebookMutation.mutate(notebook.id),
      },
    ]);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>笔记本管理</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.label}>新建笔记本</Text>
          <View style={styles.inlineForm}>
            <TextInput onChangeText={setName} placeholder="笔记本名称" placeholderTextColor="#94a3b8" style={[styles.titleInput, styles.inlineInput]} value={name} />
            <Pressable
              disabled={createNotebookMutation.isPending}
              onPress={() => createNotebookMutation.mutate()}
              style={[styles.inlineButton, createNotebookMutation.isPending && styles.buttonDisabled]}
            >
              <Plus color="#ffffff" size={18} />
            </Pressable>
          </View>
          {createNotebookMutation.error ? (
            <Text style={styles.errorText}>{createNotebookMutation.error instanceof Error ? createNotebookMutation.error.message : "创建失败"}</Text>
          ) : null}

          <Text style={styles.label}>全部笔记本</Text>
          {notebooks.map((notebook) => {
            const editing = editingNotebookId === notebook.id;

            return (
              <View key={notebook.id} style={styles.notebookManageRow}>
                {editing ? (
                  <TextInput onChangeText={setEditingName} style={[styles.titleInput, styles.inlineInput]} value={editingName} />
                ) : (
                  <View style={styles.notebookManageText}>
                    <Text numberOfLines={1} style={styles.panelValue}>
                      {notebook.name}
                    </Text>
                    <Text style={styles.panelLabel}>{notebook.memoCount} 条笔记</Text>
                  </View>
                )}

                {editing ? (
                  <IconButton onPress={() => renameNotebookMutation.mutate({ notebookId: notebook.id, nextName: editingName })}>
                    {renameNotebookMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={18} />}
                  </IconButton>
                ) : (
                  <IconButton
                    onPress={() => {
                      setEditingNotebookId(notebook.id);
                      setEditingName(notebook.name);
                    }}
                  >
                    <Pencil color="#0f172a" size={18} />
                  </IconButton>
                )}
                <IconButton onPress={() => requestDeleteNotebook(notebook)}>
                  <Trash2 color="#b91c1c" size={18} />
                </IconButton>
              </View>
            );
          })}
          {renameNotebookMutation.error ? (
            <Text style={styles.errorText}>{renameNotebookMutation.error instanceof Error ? renameNotebookMutation.error.message : "重命名失败"}</Text>
          ) : null}
          {deleteNotebookMutation.error ? (
            <Text style={styles.errorText}>{deleteNotebookMutation.error instanceof Error ? deleteNotebookMutation.error.message : "删除失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const TagsManagerModal = ({ onClose, visible }: { onClose: () => void; visible: boolean }) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [editingTagValue, setEditingTagValue] = useState("");

  const tagsQuery = useQuery({
    queryKey: ["mobile", "tags"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listTags();
    },
    enabled: Boolean(client && visible),
  });

  const invalidateTagsAndMemos = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "tags"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
  };

  const renameTagMutation = useMutation({
    mutationFn: async ({ tag, name }: { tag: string; name: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmed = name.trim();

      if (!trimmed) {
        throw new Error("请输入标签名称");
      }

      return client.renameTag(tag, trimmed);
    },
    onSuccess: async () => {
      setEditingTagName(null);
      setEditingTagValue("");
      await invalidateTagsAndMemos();
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.deleteTag(tag);
    },
    onSuccess: invalidateTagsAndMemos,
  });

  const requestDeleteTag = (tag: TagSummary) => {
    Alert.alert("删除标签？", `将从 ${tag.memoCount} 条笔记中移除 #${tag.name}。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => deleteTagMutation.mutate(tag.name),
      },
    ]);
  };

  const tags = tagsQuery.data?.tags ?? [];

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>标签管理</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        {tagsQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : tags.length === 0 ? (
          <View style={styles.centerState}>
            <Tag color="#94a3b8" size={32} />
            <Text style={styles.emptyTitle}>暂无标签</Text>
            <Text style={styles.mutedText}>在编辑笔记时添加标签后会显示在这里</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.editorForm}>
            <Text style={styles.sectionSubtitle}>共 {tags.length} 个标签</Text>
            {tags.map((tag) => {
              const editing = editingTagName === tag.name;
              const nextName = editingTagValue.trim();

              return (
                <View key={tag.name} style={styles.tagManageRow}>
                  {editing ? (
                    <TextInput
                      autoFocus
                      onChangeText={setEditingTagValue}
                      placeholder="标签名称"
                      placeholderTextColor="#94a3b8"
                      style={[styles.titleInput, styles.inlineInput]}
                      value={editingTagValue}
                    />
                  ) : (
                    <View style={styles.notebookManageText}>
                      <Text numberOfLines={1} style={styles.panelValue}>
                        #{tag.name}
                      </Text>
                      <Text style={styles.panelLabel}>{tag.memoCount} 条笔记 · {tag.updatedAt ? formatDate(tag.updatedAt) : "未更新"}</Text>
                    </View>
                  )}

                  {editing ? (
                    <>
                      <IconButton onPress={() => renameTagMutation.mutate({ tag: tag.name, name: nextName })}>
                        {renameTagMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={18} />}
                      </IconButton>
                      <IconButton
                        onPress={() => {
                          setEditingTagName(null);
                          setEditingTagValue("");
                        }}
                      >
                        <X color="#0f172a" size={18} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        onPress={() => {
                          setEditingTagName(tag.name);
                          setEditingTagValue(tag.name);
                        }}
                      >
                        <Pencil color="#0f172a" size={18} />
                      </IconButton>
                      <IconButton onPress={() => requestDeleteTag(tag)}>
                        <Trash2 color="#b91c1c" size={18} />
                      </IconButton>
                    </>
                  )}
                </View>
              );
            })}
            {renameTagMutation.error ? (
              <Text style={styles.errorText}>{renameTagMutation.error instanceof Error ? renameTagMutation.error.message : "重命名失败"}</Text>
            ) : null}
            {deleteTagMutation.error ? (
              <Text style={styles.errorText}>{deleteTagMutation.error instanceof Error ? deleteTagMutation.error.message : "删除失败"}</Text>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

type ResourceFilter = "all" | "image" | "document" | "other";

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/html",
  "text/css",
  "text/javascript",
]);

const ResourcesModal = ({
  activeMemo,
  onClose,
  visible,
}: {
  activeMemo: MemoDetail | null;
  onClose: () => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<ResourceFilter>("all");
  const [previewResource, setPreviewResource] = useState<ResourceListItem | null>(null);

  const resourcesQuery = useQuery({
    queryKey: ["mobile", "resources"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listResources();
    },
    enabled: Boolean(client && visible),
  });

  const uploadResourceMutation = useMutation({
    mutationFn: async () => {
      if (!client || !activeMemo) {
        throw new Error("请先打开一条可用笔记");
      }

      if (activeMemo.isDeleted) {
        throw new Error("回收站中的笔记不能上传资源");
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
      });

      if (result.canceled) {
        return null;
      }

      const asset = result.assets[0];

      if (!asset?.uri) {
        throw new Error("没有选择文件");
      }

      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.name || "upload",
        type: asset.mimeType || "application/octet-stream",
      } as unknown as Blob);

      const response = await client.uploadMemoResource(activeMemo.id, form);
      return response.resource;
    },
    onSuccess: async (resource) => {
      if (!resource) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "resources"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      ]);
      setFilter(resource.kind === "image" ? "image" : "all");
    },
  });

  const resources = resourcesQuery.data?.resources ?? [];
  const summary = resourcesQuery.data?.summary ?? {
    totalCount: 0,
    totalBytes: 0,
    imageCount: 0,
    attachmentCount: 0,
  };
  const filteredResources = resources.filter((resource) => {
    const isDocument = isDocumentResource(resource);

    if (filter === "image" && resource.kind !== "image") {
      return false;
    }

    if (filter === "document" && (!isDocument || resource.kind === "image")) {
      return false;
    }

    if (filter === "other" && (resource.kind === "image" || isDocument)) {
      return false;
    }

    const query = searchText.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      (resource.filename || "").toLowerCase().includes(query) ||
      (resource.memoTitle || "").toLowerCase().includes(query) ||
      (resource.memoExcerpt || "").toLowerCase().includes(query)
    );
  });

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>资源库</Text>
          <IconButton onPress={() => resourcesQuery.refetch()}>
            {resourcesQuery.isFetching ? <ActivityIndicator color="#0f172a" /> : <RefreshCw color="#0f172a" size={18} />}
          </IconButton>
        </View>

        <View style={styles.assetsToolbar}>
          <View style={styles.assetsSummary}>
            <Archive color="#047857" size={18} />
            <Text style={styles.assetsSummaryText}>{summary.totalCount} 个文件</Text>
            <Text style={styles.assetsSummaryMeta}>{formatBytes(summary.totalBytes)}</Text>
          </View>
          <View style={styles.assetsSummary}>
            <ImageIcon color="#64748b" size={16} />
            <Text style={styles.assetsSummaryMeta}>{summary.imageCount} 张图片</Text>
            <HardDrive color="#64748b" size={16} />
            <Text style={styles.assetsSummaryMeta}>{summary.attachmentCount} 个附件</Text>
          </View>

          <View style={styles.searchBox}>
            <Search color="#64748b" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearchText}
              placeholder="搜索文件名或来源笔记"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")}>
                <X color="#64748b" size={18} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <OptionPill active={filter === "all"} label="全部" onPress={() => setFilter("all")} />
            <OptionPill active={filter === "image"} label="图片" onPress={() => setFilter("image")} />
            <OptionPill active={filter === "document"} label="文档" onPress={() => setFilter("document")} />
            <OptionPill active={filter === "other"} label="其他" onPress={() => setFilter("other")} />
          </ScrollView>

          <Pressable
            disabled={!activeMemo || activeMemo.isDeleted || uploadResourceMutation.isPending}
            onPress={() => uploadResourceMutation.mutate()}
            style={[styles.uploadButton, (!activeMemo || activeMemo.isDeleted || uploadResourceMutation.isPending) && styles.buttonDisabled]}
          >
            {uploadResourceMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Upload color="#ffffff" size={18} />}
            <Text style={styles.uploadButtonText}>{uploadResourceMutation.isPending ? "上传中" : "上传附件"}</Text>
          </Pressable>

          <Text style={styles.assetsHint}>
            {activeMemo ? `当前笔记：${activeMemo.title?.trim() || activeMemo.excerpt || DEFAULT_MEMO_TITLE}` : "打开一条笔记后可作为资源上传目标"}
          </Text>
          {uploadResourceMutation.error ? (
            <Text style={styles.errorText}>{uploadResourceMutation.error instanceof Error ? uploadResourceMutation.error.message : "上传失败"}</Text>
          ) : null}
        </View>

        {resourcesQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : filteredResources.length === 0 ? (
          <View style={styles.centerState}>
            <Archive color="#94a3b8" size={32} />
            <Text style={styles.emptyTitle}>{searchText || filter !== "all" ? "没有匹配资源" : "资源库为空"}</Text>
            <Text style={styles.mutedText}>{searchText || filter !== "all" ? "调整筛选条件后再试" : "PWA 上传的图片和附件会显示在这里"}</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.assetList}
            data={filteredResources}
            keyExtractor={(resource) => resource.id}
            renderItem={({ item }) => <ResourceCard resource={item} onOpen={() => openResource(item)} onPreview={() => setPreviewResource(item)} />}
            refreshControl={<RefreshControl onRefresh={() => resourcesQuery.refetch()} refreshing={resourcesQuery.isFetching} tintColor="#0f172a" />}
          />
        )}

        <ImagePreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />
      </SafeAreaView>
    </Modal>
  );
};

const ResourceCard = ({
  onOpen,
  onPreview,
  resource,
}: {
  onOpen: () => void;
  onPreview: () => void;
  resource: ResourceListItem;
}) => {
  const source = resource.memoDeleted ? "已删除笔记" : resource.memoTitle || resource.memoExcerpt || resource.memoId;
  const isImage = resource.kind === "image";

  return (
    <Pressable onPress={isImage ? onPreview : onOpen} style={styles.resourceCard}>
      <View style={styles.resourceThumb}>
        {isImage ? (
          <RNImage source={{ uri: resource.url }} style={styles.resourceImage} />
        ) : (
          <View style={styles.resourceFileIcon}>{getResourceIcon(resource)}</View>
        )}
      </View>
      <View style={styles.resourceInfo}>
        <Text numberOfLines={1} style={styles.memoTitle}>
          {resource.filename || resource.id}
        </Text>
        <Text numberOfLines={1} style={styles.panelLabel}>
          {formatBytes(resource.byteSize)} · {resource.mimeType?.split("/")[1] || resource.kind} · {formatDate(resource.createdAt)}
        </Text>
        <Text numberOfLines={1} style={styles.panelLabel}>
          来源：{source}
        </Text>
      </View>
      <Pressable onPress={onOpen} style={styles.secondaryIconButton}>
        <ExternalLink color="#0f172a" size={16} />
      </Pressable>
    </Pressable>
  );
};

const ImagePreviewModal = ({ onClose, resource }: { onClose: () => void; resource: ResourceListItem | null }) => (
  <Modal animationType="fade" transparent visible={Boolean(resource)} onRequestClose={onClose}>
    <View style={styles.previewBackdrop}>
      <View style={styles.previewHeader}>
        <Text numberOfLines={1} style={styles.previewTitle}>
          {resource?.filename || "图片预览"}
        </Text>
        <IconButton onPress={onClose}>
          <X color="#0f172a" size={20} />
        </IconButton>
      </View>
      {resource ? <RNImage resizeMode="contain" source={{ uri: resource.url }} style={styles.previewImage} /> : null}
      {resource ? (
        <Pressable onPress={() => openResource(resource)} style={styles.previewOpenButton}>
          <ExternalLink color="#ffffff" size={18} />
          <Text style={styles.previewOpenText}>打开原文件</Text>
        </Pressable>
      ) : null}
    </View>
  </Modal>
);

const RevisionHistoryModal = ({
  memo,
  onClose,
  onRestored,
}: {
  memo: MemoDetail | null;
  onClose: () => void;
  onRestored: (memo: MemoDetail) => void;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);

  const revisionsQuery = useQuery({
    queryKey: ["mobile", "memo-revisions", memo?.id],
    queryFn: async () => {
      if (!client || !memo) {
        throw new Error("Memo is not selected");
      }

      return client.listMemoRevisions(memo.id);
    },
    enabled: Boolean(client && memo),
  });

  const revisions = revisionsQuery.data?.revisions ?? [];
  const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? revisions[0] ?? null;
  const changedLines = selectedRevision ? countChangedLines(selectedRevision.contentMarkdown, memo?.contentMarkdown ?? "") : 0;

  useEffect(() => {
    if (memo && revisions.length > 0 && !selectedRevisionId) {
      setSelectedRevisionId(revisions[0].id);
    }
  }, [memo, revisions, selectedRevisionId]);

  useEffect(() => {
    if (!memo) {
      setSelectedRevisionId(null);
    }
  }, [memo]);

  useEffect(() => {
    setSelectedRevisionId(null);
  }, [memo?.id]);

  const restoreRevisionMutation = useMutation({
    mutationFn: async (revision: MemoRevision) => {
      if (!client || !memo) {
        throw new Error("Memo is not selected");
      }

      const response = await client.restoreMemoRevision(memo.id, revision.id);
      return response.memo;
    },
    onSuccess: async (restoredMemo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memo-revisions", restoredMemo.id] }),
      ]);
      onRestored(restoredMemo);
    },
  });

  const requestRestoreRevision = (revision: MemoRevision) => {
    Alert.alert("恢复此版本？", `将把笔记内容恢复到修订 ${revision.revision}。当前内容会作为新的修订保留。`, [
      { text: "取消", style: "cancel" },
      {
        text: "恢复",
        onPress: () => restoreRevisionMutation.mutate(revision),
      },
    ]);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(memo)}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text numberOfLines={1} style={styles.modalTitle}>
            修订历史
          </Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        {revisionsQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : revisions.length === 0 ? (
          <View style={styles.centerState}>
            <History color="#94a3b8" size={32} />
            <Text style={styles.emptyTitle}>暂无历史版本</Text>
            <Text style={styles.mutedText}>笔记保存后产生的修订会显示在这里</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.editorForm}>
            <Text style={styles.detailTitle}>{memo?.title?.trim() || DEFAULT_MEMO_TITLE}</Text>
            <Text style={styles.sectionSubtitle}>{selectedRevision ? `修订 ${selectedRevision.revision} · ${changedLines} 行差异` : "请选择一个修订"}</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {revisions.map((revision) => (
                <Pressable
                  key={revision.id}
                  onPress={() => setSelectedRevisionId(revision.id)}
                  style={[styles.revisionPill, selectedRevision?.id === revision.id && styles.revisionPillActive]}
                >
                  <Text style={[styles.revisionPillTitle, selectedRevision?.id === revision.id && styles.revisionPillTitleActive]}>修订 {revision.revision}</Text>
                  <Text style={[styles.revisionPillMeta, selectedRevision?.id === revision.id && styles.revisionPillTitleActive]}>
                    {formatDate(revision.createdAt)} · {formatRevisionActor(revision.createdBy)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {selectedRevision ? (
              <>
                <ActionButton disabled={restoreRevisionMutation.isPending || Boolean(memo?.isDeleted)} label={restoreRevisionMutation.isPending ? "恢复中" : "恢复此版本"} onPress={() => requestRestoreRevision(selectedRevision)}>
                  <RotateCcw color="#0f172a" size={16} />
                </ActionButton>
                <View style={styles.revisionPreviewBlock}>
                  <Text style={styles.label}>历史版本</Text>
                  <Text style={styles.revisionPreviewText}>{selectedRevision.contentMarkdown || selectedRevision.contentText || "没有正文内容"}</Text>
                </View>
                <View style={styles.revisionPreviewBlock}>
                  <Text style={styles.label}>当前内容</Text>
                  <Text style={styles.revisionPreviewText}>{memo?.contentMarkdown || memo?.contentText || "没有正文内容"}</Text>
                </View>
              </>
            ) : null}
            {restoreRevisionMutation.error ? (
              <Text style={styles.errorText}>{restoreRevisionMutation.error instanceof Error ? restoreRevisionMutation.error.message : "恢复失败"}</Text>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const MemoDetailModal = ({
  isDeleting,
  isLoading,
  isRestoring,
  isSaving,
  memo,
  onClose,
  onDelete,
  onEdit,
  onOpenResources,
  onOpenRevisions,
  onRestore,
  onTogglePin,
  visible,
}: {
  isDeleting: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  isSaving: boolean;
  memo: MemoDetail | null;
  onClose: () => void;
  onDelete: (memo: MemoDetail) => void;
  onEdit: (memo: MemoDetail) => void;
  onOpenResources: () => void;
  onOpenRevisions: (memo: MemoDetail) => void;
  onRestore: (memo: MemoDetail) => void;
  onTogglePin: (memo: MemoDetail) => void;
  visible: boolean;
}) => (
  <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
    <SafeAreaView style={styles.modalSafeArea}>
      <View style={styles.modalHeader}>
        <IconButton onPress={onClose}>
          <X color="#0f172a" size={20} />
        </IconButton>
        <Text numberOfLines={1} style={styles.modalTitle}>
          {memo?.title?.trim() || DEFAULT_MEMO_TITLE}
        </Text>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#0f172a" />
        </View>
      ) : memo ? (
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.detailTitle}>{memo.title?.trim() || DEFAULT_MEMO_TITLE}</Text>
          <View style={styles.memoMeta}>
            <Text style={styles.memoDate}>{formatDate(memo.updatedAt)}</Text>
            <Text style={styles.memoDate}>修订 {memo.revision}</Text>
          </View>
          <View style={styles.actionRow}>
            {memo.isDeleted ? (
              <ActionButton disabled={isRestoring} label={isRestoring ? "恢复中" : "恢复"} onPress={() => onRestore(memo)}>
                <RotateCcw color="#0f172a" size={16} />
              </ActionButton>
            ) : (
              <>
                <ActionButton disabled={isSaving} label={memo.isPinned ? "取消置顶" : "置顶"} onPress={() => onTogglePin(memo)}>
                  <Pin color="#0f172a" size={16} />
                </ActionButton>
                <ActionButton label="编辑" onPress={() => onEdit(memo)}>
                  <Pencil color="#0f172a" size={16} />
                </ActionButton>
                <ActionButton label="历史" onPress={() => onOpenRevisions(memo)}>
                  <History color="#0f172a" size={16} />
                </ActionButton>
                <ActionButton label="资源" onPress={onOpenResources}>
                  <Archive color="#0f172a" size={16} />
                </ActionButton>
              </>
            )}
            <ActionButton danger disabled={isDeleting} label={isDeleting ? "删除中" : memo.isDeleted ? "永久删除" : "删除"} onPress={() => onDelete(memo)}>
              <Trash2 color="#b91c1c" size={16} />
            </ActionButton>
          </View>
          {memo.tags.length ? (
            <View style={styles.tagList}>
              {memo.tags.map((tag) => (
                <Text key={tag} style={styles.tag}>
                  #{tag}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={styles.detailMarkdown}>{memo.contentMarkdown || memo.contentText || "没有正文内容"}</Text>
        </ScrollView>
      ) : (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>笔记加载失败</Text>
        </View>
      )}
    </SafeAreaView>
  </Modal>
);

const EditMemoModal = ({
  memo,
  notebooks,
  onClose,
  onSaved,
  updateMutation,
}: {
  memo: MemoDetail | null;
  notebooks: Notebook[];
  onClose: () => void;
  onSaved: (memo: MemoDetail) => void;
  updateMutation: UseMutationResult<
    MemoDetail,
    Error,
    {
      memo: MemoDetail;
      payload: {
        title?: string;
        contentMarkdown?: string;
        isPinned?: boolean;
        notebookId?: string;
        tags?: string[];
      };
    }
  >;
}) => {
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [notebookId, setNotebookId] = useState("");
  const [tagsText, setTagsText] = useState("");

  useEffect(() => {
    if (memo) {
      setTitle(memo.title?.trim() || "");
      setContentMarkdown(memo.contentMarkdown || "");
      setNotebookId(memo.notebookId);
      setTagsText(memo.tags.join(", "));
    }
  }, [memo]);

  const handleSave = () => {
    if (!memo || updateMutation.isPending) {
      return;
    }

    updateMutation.mutate(
      {
        memo,
        payload: {
          title: title.trim() || DEFAULT_MEMO_TITLE,
          contentMarkdown,
          notebookId,
          tags: parseTags(tagsText),
        },
      },
      {
        onSuccess: onSaved,
      }
    );
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(memo)}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>编辑笔记</Text>
          <IconButton onPress={handleSave}>
            {updateMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={20} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.label}>笔记本</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {notebooks.map((notebook) => (
              <NotebookPill
                active={notebookId === notebook.id}
                key={notebook.id}
                label={notebook.name}
                memoCount={notebook.memoCount}
                onPress={() => setNotebookId(notebook.id)}
              />
            ))}
          </ScrollView>

          <Text style={styles.label}>标题</Text>
          <TextInput onChangeText={setTitle} placeholder={DEFAULT_MEMO_TITLE} placeholderTextColor="#94a3b8" style={styles.titleInput} value={title} />

          <Text style={styles.label}>标签</Text>
          <TextInput onChangeText={setTagsText} placeholder="用逗号分隔标签" placeholderTextColor="#94a3b8" style={styles.titleInput} value={tagsText} />

          <Text style={styles.label}>正文</Text>
          <TextInput
            multiline
            onChangeText={setContentMarkdown}
            placeholder="Markdown 正文"
            placeholderTextColor="#94a3b8"
            style={styles.markdownInput}
            textAlignVertical="top"
            value={contentMarkdown}
          />

          {updateMutation.error ? (
            <Text style={styles.errorText}>{updateMutation.error instanceof Error ? updateMutation.error.message : "保存失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const MemoList = ({
  emptyDescription,
  emptyTitle,
  error,
  isError,
  isLoading,
  isRefreshing,
  memos,
  onMemoLongPress,
  onMemoPress,
  onRefresh,
  selectedMemoIds = new Set(),
}: {
  emptyDescription: string;
  emptyTitle: string;
  error?: unknown;
  isError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  memos: MemoSummary[];
  onMemoLongPress?: (memoId: string) => void;
  onMemoPress: (memoId: string) => void;
  onRefresh: () => void;
  selectedMemoIds?: Set<string>;
}) => {
  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color="#0f172a" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>加载失败</Text>
        <Text style={styles.mutedText}>{error instanceof Error ? error.message : "请稍后再试"}</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={memos.length === 0 ? styles.emptyList : styles.list}
      data={memos}
      keyExtractor={(memo) => memo.id}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={isRefreshing} tintColor="#0f172a" />}
      renderItem={({ item }) => (
        <MemoCard
          memo={item}
          onLongPress={onMemoLongPress ? () => onMemoLongPress(item.id) : undefined}
          onPress={() => onMemoPress(item.id)}
          selected={selectedMemoIds.has(item.id)}
          selectionMode={selectedMemoIds.size > 0}
        />
      )}
      ListEmptyComponent={
        <View style={styles.centerState}>
          <BookOpen color="#94a3b8" size={32} />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.mutedText}>{emptyDescription}</Text>
        </View>
      }
    />
  );
};

const MoveSelectionModal = ({
  isMoving,
  notebooks,
  onClose,
  onMove,
  selectedCount,
  visible,
}: {
  isMoving: boolean;
  notebooks: Notebook[];
  onClose: () => void;
  onMove: (notebookId: string) => void;
  selectedCount: number;
  visible: boolean;
}) => {
  const [targetNotebookId, setTargetNotebookId] = useState("");

  useEffect(() => {
    if (visible) {
      setTargetNotebookId(notebooks[0]?.id ?? "");
    }
  }, [notebooks, visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>移动笔记</Text>
          <IconButton onPress={() => targetNotebookId && onMove(targetNotebookId)}>
            {isMoving ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={20} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.sectionSubtitle}>已选择 {selectedCount} 条笔记</Text>
          <Text style={styles.label}>目标笔记本</Text>
          {notebooks.map((notebook) => (
            <Pressable
              key={notebook.id}
              onPress={() => setTargetNotebookId(notebook.id)}
              style={[styles.moveNotebookRow, targetNotebookId === notebook.id && styles.moveNotebookRowActive]}
            >
              <View style={styles.moveNotebookText}>
                <Text numberOfLines={1} style={styles.panelValue}>
                  {notebook.name}
                </Text>
                <Text style={styles.panelLabel}>{notebook.memoCount} 条笔记</Text>
              </View>
              {targetNotebookId === notebook.id ? <Check color="#0f172a" size={18} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const SelectionActionBar = ({
  canMerge,
  canMove,
  isBusy,
  isTrashView,
  onClear,
  onDelete,
  onMerge,
  onMove,
  onPin,
  pinLabel,
  selectedCount,
}: {
  canMerge: boolean;
  canMove: boolean;
  isBusy: boolean;
  isTrashView: boolean;
  onClear: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onMove: () => void;
  onPin: () => void;
  pinLabel: string;
  selectedCount: number;
}) => (
  <View style={styles.selectionBar}>
    <View style={styles.selectionBarHeader}>
      <Text style={styles.selectionCount}>已选 {selectedCount} 条</Text>
      <Pressable onPress={onClear}>
        <Text style={styles.selectionClear}>取消</Text>
      </Pressable>
    </View>
    <View style={styles.selectionActions}>
      <SelectionAction disabled={isBusy || !canMove} icon={<Folder color={canMove ? "#0f172a" : "#cbd5e1"} size={18} />} label="移动" onPress={onMove} />
      <SelectionAction disabled={isBusy || isTrashView} icon={<Pin color={isTrashView ? "#cbd5e1" : "#0f172a"} size={18} />} label={pinLabel} onPress={onPin} />
      <SelectionAction disabled={isBusy || !canMerge} icon={<Merge color={canMerge ? "#0f172a" : "#cbd5e1"} size={18} />} label="合并" onPress={onMerge} />
      <SelectionAction danger disabled={isBusy} icon={<Trash2 color="#b91c1c" size={18} />} label={isTrashView ? "永久删除" : "删除"} onPress={onDelete} />
    </View>
  </View>
);

const SelectionAction = ({
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.selectionAction, disabled && styles.buttonDisabled]}>
    {icon}
    <Text style={[styles.selectionActionText, danger && styles.selectionActionTextDanger]}>{label}</Text>
  </Pressable>
);

const NotebookPill = ({
  active,
  label,
  memoCount,
  onPress,
}: {
  active: boolean;
  label: string;
  memoCount: number;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={[styles.notebookPill, active && styles.notebookPillActive]}>
    <Text numberOfLines={1} style={[styles.notebookPillText, active && styles.notebookPillTextActive]}>
      {label}
    </Text>
    <Text style={[styles.notebookPillCount, active && styles.notebookPillTextActive]}>{memoCount}</Text>
  </Pressable>
);

const OptionPill = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.optionPill, active && styles.optionPillActive]}>
    <Text style={[styles.optionPillText, active && styles.optionPillTextActive]}>{label}</Text>
  </Pressable>
);

const MemoCard = ({
  memo,
  onLongPress,
  onPress,
  selected = false,
  selectionMode = false,
}: {
  memo: MemoSummary;
  onLongPress?: () => void;
  onPress: () => void;
  selected?: boolean;
  selectionMode?: boolean;
}) => (
  <Pressable onLongPress={onLongPress} onPress={onPress} style={[styles.memoCard, selected && styles.memoCardSelected]}>
    <View style={styles.memoCardTop}>
      {selectionMode ? (
        <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorActive]}>
          {selected ? <Check color="#ffffff" size={14} /> : null}
        </View>
      ) : (
        <FileText color="#64748b" size={18} />
      )}
      <Text numberOfLines={1} style={styles.memoTitle}>
        {memo.title?.trim() || DEFAULT_MEMO_TITLE}
      </Text>
      {memo.isPinned ? <Text style={styles.pinText}>置顶</Text> : null}
    </View>
    <Text numberOfLines={2} style={styles.memoExcerpt}>
      {memo.excerpt || "没有正文预览"}
    </Text>
    <View style={styles.memoMeta}>
      <Text style={styles.memoDate}>{formatDate(memo.updatedAt)}</Text>
      {memo.tags.slice(0, 2).map((tag) => (
        <Text key={tag} style={styles.tag}>
          #{tag}
        </Text>
      ))}
    </View>
  </Pressable>
);

const PanelRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.panelRow}>
    <Text style={styles.panelLabel}>{label}</Text>
    <Text selectable style={styles.panelValue}>
      {value}
    </Text>
  </View>
);

const IconButton = ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={styles.iconButton}>
    {children}
  </Pressable>
);

const ActionButton = ({
  children,
  danger = false,
  disabled = false,
  label,
  onPress,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, danger && styles.actionButtonDanger, disabled && styles.buttonDisabled]}>
    {children}
    <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>{label}</Text>
  </Pressable>
);

const BottomNavItem = ({ active = false, icon, label, onPress }: { active?: boolean; icon: ReactNode; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.bottomNavItem}>
    {icon}
    <Text style={[styles.bottomNavText, active && styles.bottomNavTextActive]}>{label}</Text>
  </Pressable>
);

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${exponent === 0 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`;
};

const isDocumentResource = (resource: ResourceListItem) => DOCUMENT_MIME_TYPES.has(resource.mimeType || "") || resource.kind === "attachment";

const getResourceIcon = (resource: ResourceListItem) => {
  const mime = (resource.mimeType || "").toLowerCase();

  if (mime.startsWith("image/")) {
    return <ImageIcon color="#10b981" size={28} />;
  }

  return <FileText color={mime === "application/pdf" ? "#dc2626" : "#2563eb"} size={28} />;
};

const openResource = (resource: ResourceListItem) => {
  Linking.openURL(resource.url).catch(() => {
    Alert.alert("无法打开资源", "系统没有可用应用打开此链接。");
  });
};

const countChangedLines = (left: string, right: string) => {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const maxLines = Math.max(leftLines.length, rightLines.length);
  let changed = 0;

  for (let index = 0; index < maxLines; index += 1) {
    if ((leftLines[index] ?? "") !== (rightLines[index] ?? "")) {
      changed += 1;
    }
  }

  return changed;
};

const formatRevisionActor = (actor: string) => {
  if (actor.startsWith("user:")) {
    return "user";
  }

  if (actor.startsWith("agent:")) {
    return "agent";
  }

  return actor || "system";
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  viewBody: {
    flex: 1,
    paddingBottom: 64,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800",
  },
  instance: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
    maxWidth: 230,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconButtonPlaceholder: {
    height: 38,
    width: 38,
  },
  tabs: {
    paddingLeft: 18,
    paddingTop: 18,
  },
  notebookPill: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginRight: 8,
    maxWidth: 190,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  notebookPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  notebookPillText: {
    color: "#334155",
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  notebookPillTextActive: {
    color: "#ffffff",
  },
  notebookPillCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  contentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 10,
  },
  contentActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  searchHeader: {
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 10,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: "#0f172a",
    flex: 1,
    fontSize: 15,
    minHeight: 44,
  },
  assetsToolbar: {
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    gap: 10,
    padding: 14,
  },
  assetsSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  assetsSummaryText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  assetsSummaryMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  assetsHint: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  uploadButton: {
    alignItems: "center",
    backgroundColor: "#047857",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  uploadButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  primaryIconButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  secondaryIconButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dangerIconButton: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  listControls: {
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 18,
  },
  optionPill: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    marginRight: 8,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  optionPillActive: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
  },
  optionPillText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  optionPillTextActive: {
    color: "#0f172a",
  },
  list: {
    paddingBottom: 22,
    paddingHorizontal: 18,
  },
  assetList: {
    padding: 18,
    paddingBottom: 48,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: 22,
  },
  memoCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  memoCardSelected: {
    backgroundColor: "#f8fafc",
    borderColor: "#0f172a",
  },
  memoCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  selectionIndicator: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 6,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  selectionIndicatorActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  memoTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  pinText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
  },
  memoExcerpt: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  memoMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  memoDate: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  tagList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  resourceCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  resourceThumb: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 58,
  },
  resourceImage: {
    height: "100%",
    width: "100%",
  },
  resourceFileIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  resourceInfo: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  emptyTitle: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "800",
  },
  mutedText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },
  panelList: {
    gap: 12,
    padding: 18,
    paddingBottom: 96,
  },
  panelRow: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  panelLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  panelValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  dangerButtonText: {
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: "800",
  },
  warningPanel: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  warningText: {
    color: "#92400e",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalSafeArea: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  modalTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    marginHorizontal: 12,
    textAlign: "center",
  },
  detailContent: {
    padding: 18,
    paddingBottom: 48,
  },
  detailTitle: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
  detailMarkdown: {
    color: "#1f2937",
    fontSize: 16,
    lineHeight: 25,
    marginTop: 20,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  actionButtonDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  actionButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  actionButtonTextDanger: {
    color: "#b91c1c",
  },
  inlineForm: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  inlineButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  notebookManageRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 58,
    padding: 10,
  },
  notebookManageText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  tagManageRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 60,
    padding: 10,
  },
  templateCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    padding: 12,
  },
  templateIcon: {
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  templateText: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  moveNotebookRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    padding: 12,
  },
  moveNotebookRowActive: {
    borderColor: "#0f172a",
  },
  moveNotebookText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  editorForm: {
    gap: 12,
    padding: 18,
    paddingBottom: 48,
  },
  revisionPill: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    minHeight: 58,
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  revisionPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  revisionPillTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  revisionPillTitleActive: {
    color: "#ffffff",
  },
  revisionPillMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  revisionPreviewBlock: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  revisionPreviewText: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  titleInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  markdownInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 23,
    minHeight: 260,
    padding: 14,
  },
  bottomNav: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    height: 64,
    justifyContent: "space-around",
    left: 0,
    position: "absolute",
    right: 0,
  },
  selectionBar: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopWidth: 1,
    bottom: 64,
    left: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    position: "absolute",
    right: 0,
  },
  selectionBarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  selectionCount: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  selectionClear: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 8,
  },
  selectionAction: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 54,
  },
  selectionActionText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
  },
  selectionActionTextDanger: {
    color: "#b91c1c",
  },
  bottomNavItem: {
    alignItems: "center",
    gap: 4,
    minWidth: 58,
  },
  bottomNavText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  bottomNavTextActive: {
    color: "#0f172a",
  },
  previewBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  previewHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    flexDirection: "row",
    gap: 12,
    left: 16,
    padding: 10,
    position: "absolute",
    right: 16,
    top: 54,
    zIndex: 2,
  },
  previewTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  previewImage: {
    height: "72%",
    width: "100%",
  },
  previewOpenButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 42,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 16,
    position: "absolute",
  },
  previewOpenText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
