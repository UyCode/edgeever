import { ChevronLeft, Download, HelpCircle, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export const EvernoteImportGuidePane = ({ onClose }: { onClose: () => void }) => (
  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-slate-50">
    <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-end justify-between border-b border-slate-200 bg-white px-4 pb-3 pt-[env(safe-area-inset-top)] lg:h-16 lg:items-center lg:px-6 lg:pb-0 lg:pt-0">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          title="返回我的"
          aria-label="返回我的"
          onClick={onClose}
          className="h-9 w-9 rounded-lg hover:bg-slate-100"
        >
          <ChevronLeft className="h-5 w-5 text-slate-500" />
        </Button>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-bold leading-tight text-slate-900">
            <HelpCircle className="h-4 w-4 text-emerald-700" />
            印象笔记迁移指引
          </h1>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-400">先导出 ENEX，再回 EdgeEver 导入</p>
        </div>
      </div>
    </header>

    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 lg:px-6 lg:py-6">
      <article className="mx-auto grid w-full min-w-0 max-w-4xl gap-4">
        <section className="rounded-lg border border-emerald-100 bg-white p-5 shadow-none">
          <h2 className="text-lg font-bold text-slate-950">最省事的迁移方式</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            EdgeEver 只导入 .enex 文件。先用 evernote-backup 从印象笔记导出 ENEX，再回到这里选择文件导入。
          </p>
        </section>

        <GuideStep
          index="1"
          icon={<Download className="h-4 w-4" />}
          title="用 evernote-backup 导出 ENEX"
        >
          <p>在电脑终端执行下面几行命令：</p>
          <GuideCode>{`pipx install evernote-backup
evernote-backup init-db --backend china
evernote-backup sync
evernote-backup export ./edgeever-import`}</GuideCode>
          <p>完成后，当前目录会出现 <code>edgeever-import</code> 文件夹，里面是一批 .enex 文件。通常一个笔记本对应一个 .enex 文件。</p>
          <p>只想导出部分笔记本时，可以在最后一行加上笔记本名：</p>
          <GuideCode>{`evernote-backup export ./edgeever-import --notebook "工作项目"`}</GuideCode>
        </GuideStep>

        <GuideStep
          index="2"
          icon={<UploadCloud className="h-4 w-4" />}
          title="回到 EdgeEver 导入"
        >
          <ol className="list-decimal space-y-1 pl-5">
            <li>回到“我的”页面里的“导入印象笔记”。</li>
            <li>点击“选择文件”，选择 <code>edgeever-import</code> 里的 .enex 文件。</li>
            <li>确认导入计划里的笔记本数量和笔记数量。</li>
            <li>点击“开始导入”。</li>
            <li>每导完一个笔记本，先检查结果，再点击“确认结果，继续下一个”。</li>
          </ol>
        </GuideStep>

        <GuideStep index="3" icon={<HelpCircle className="h-4 w-4" />} title="如果遇到问题">
          <ul className="list-disc space-y-1 pl-5">
            <li>EdgeEver 只支持 .enex，不支持印象笔记新版 .notes。</li>
            <li>如果导入中断，先检查最后一个已导入的笔记本，避免重复导入。</li>
            <li>EdgeEver 会校验原始创建时间和修改时间；时间不一致时会停止导入。</li>
            <li>图片和附件当前会保留为资源占位链接，重要附件建议迁移后抽查。</li>
          </ul>
        </GuideStep>
      </article>
    </main>
  </div>
);

const GuideStep = ({
  index,
  icon,
  title,
  children,
}: {
  index: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700 shadow-none">
    <div className="mb-3 flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-400">步骤 {index}</div>
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const GuideCode = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-md border border-slate-100 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
    <code>{children}</code>
  </pre>
);
