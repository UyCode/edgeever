import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileArchive, FileCheck2, Play, RotateCcw, UploadCloud } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { parseEvernoteExportFiles, type EvernoteImportNotebook } from "@/lib/evernote-import";

type ImportPhase = "idle" | "planned" | "importing" | "awaiting-confirmation" | "done" | "error";

type ImportedNotebookSummary = {
  name: string;
  createdCount: number;
};

export const EvernoteImportCard = () => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [notebooks, setNotebooks] = useState<EvernoteImportNotebook[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentMemoIndex, setCurrentMemoIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedNotebookSummary[]>([]);

  const totalNotes = useMemo(
    () => notebooks.reduce((sum, notebook) => sum + notebook.notes.length, 0),
    [notebooks]
  );
  const currentNotebook = notebooks[currentIndex] ?? null;
  const importedNoteCount = imported.reduce((sum, item) => sum + item.createdCount, 0);
  const progressLabel =
    phase === "importing" && currentNotebook
      ? `${currentNotebook.name}：${currentMemoIndex}/${currentNotebook.notes.length}`
      : imported.length > 0
        ? `已导入 ${importedNoteCount}/${totalNotes} 条笔记`
        : "等待选择导出文件";

  const handleFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setError(null);
    setImported([]);
    setCurrentIndex(0);
    setCurrentMemoIndex(0);

    try {
      const parsed = await parseEvernoteExportFiles(files);

      if (parsed.length === 0) {
        throw new Error("请选择 .notes 或 .enex 文件。");
      }

      setNotebooks(parsed);
      setPhase("planned");
    } catch (parseError) {
      setNotebooks([]);
      setPhase("error");
      setError(parseError instanceof Error ? parseError.message : "解析印象笔记导出文件失败。");
    }
  };

  const reset = () => {
    setPhase("idle");
    setNotebooks([]);
    setCurrentIndex(0);
    setCurrentMemoIndex(0);
    setError(null);
    setImported([]);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const importNotebook = async (index: number) => {
    const notebook = notebooks[index];

    if (!notebook) {
      return;
    }

    setPhase("importing");
    setError(null);
    setCurrentIndex(index);
    setCurrentMemoIndex(0);

    try {
      const existingNotebooks = (await api.listNotebooks()).notebooks;
      const targetNotebook =
        existingNotebooks.find((item) => item.parentId === null && item.name === notebook.name) ??
        (await api.createNotebook({ name: notebook.name, parentId: null })).notebook;
      let createdCount = 0;

      for (const note of notebook.notes) {
        const result = await api.createMemo({
          notebookId: targetNotebook.id,
          title: note.title,
          contentMarkdown: note.markdown,
          tags: note.tags,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        });

        if (result.memo.createdAt !== note.createdAt || result.memo.updatedAt !== note.updatedAt) {
          throw new Error(`「${note.title}」导入后的创建时间或修改时间与印象笔记原始时间不一致。`);
        }

        createdCount += 1;
        setCurrentMemoIndex(createdCount);
      }

      setImported((items) => [...items, { name: notebook.name, createdCount }]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
      ]);
      setPhase(index < notebooks.length - 1 ? "awaiting-confirmation" : "done");
    } catch (importError) {
      setPhase("error");
      setError(importError instanceof Error ? importError.message : "导入失败。");
    }
  };

  const continueImport = () => {
    void importNotebook(currentIndex + 1);
  };

  return (
    <Card className="hidden w-full min-w-0 overflow-hidden shadow-none lg:block">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <UploadCloud className="h-4 w-4 text-emerald-700" />
          导入印象笔记
        </CardTitle>
        <CardDescription className="text-xs leading-4">
          按笔记本选择 .notes 或 .enex 文件，EdgeEver 会逐个笔记本导入并保留原始创建、修改时间。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="flex min-h-16 items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
            <FileArchive className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{progressLabel}</div>
            <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
              每个文件会作为一个同名根笔记本导入，导完一个后需要确认再继续。
            </div>
          </div>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".notes,.enex"
            multiple
            onChange={(event) => void handleFilesChange(event)}
          />
          <Button
            size="md"
            variant="outline"
            className="h-9 shrink-0 bg-white"
            type="button"
            disabled={phase === "importing"}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud className="h-4 w-4" />
            选择文件
          </Button>
        </div>

        {notebooks.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <div className="grid grid-cols-[1fr_7rem] bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              <span>笔记本</span>
              <span className="text-right">笔记数</span>
            </div>
            <div className="max-h-52 overflow-auto">
              {notebooks.map((notebook, index) => {
                const state =
                  imported[index] ? "done" : index === currentIndex && phase === "importing" ? "importing" : "pending";

                return (
                  <div
                    key={`${notebook.fileName}-${index}`}
                    className="grid min-h-10 grid-cols-[1fr_7rem] items-center border-t border-slate-100 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-semibold text-slate-800" title={notebook.fileName}>
                      {state === "done" && <FileCheck2 className="mr-1.5 inline h-4 w-4 text-emerald-600" />}
                      {notebook.name}
                    </span>
                    <span
                      className={cn(
                        "text-right text-xs font-bold",
                        state === "done" ? "text-emerald-700" : state === "importing" ? "text-slate-900" : "text-slate-500"
                      )}
                    >
                      {notebook.notes.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {(phase === "planned" || phase === "error" || phase === "done" || phase === "awaiting-confirmation") && notebooks.length > 0 && (
            <Button size="md" variant="ghost" className="h-9" type="button" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              重新选择
            </Button>
          )}
          {phase === "planned" && (
            <Button
              size="md"
              variant="solid"
              className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
              type="button"
              onClick={() => void importNotebook(0)}
            >
              <Play className="h-4 w-4" />
              开始导入
            </Button>
          )}
          {phase === "awaiting-confirmation" && (
            <Button
              size="md"
              variant="solid"
              className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
              type="button"
              onClick={continueImport}
            >
              <Play className="h-4 w-4" />
              确认结果，继续下一个
            </Button>
          )}
          {phase === "importing" && (
            <Button size="md" variant="outline" className="h-9 bg-white" type="button" disabled>
              正在导入
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
