import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  consumePwaBuildUpdate,
  consumePwaUpdateReloadPending,
  PWA_UPDATE_NOTICE_EVENT,
  type PwaUpdateNoticeEvent,
  type PwaUpdateNoticeKind,
} from "@/lib/pwa-update-notice";

type Notice = {
  buildLabel?: string;
  id: number;
  kind: PwaUpdateNoticeKind;
};

const isStandaloneApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const isDesktopViewport = () => window.matchMedia("(min-width: 1024px)").matches;

const getDisplayMode = () => {
  const isStandalone = isStandaloneApp();

  return {
    isDesktop: isDesktopViewport(),
    visible: isStandalone,
  };
};

const watchDisplayMode = (onChange: () => void) => {
  const mediaQueries = [
    window.matchMedia("(display-mode: standalone)"),
    window.matchMedia("(display-mode: fullscreen)"),
    window.matchMedia("(min-width: 1024px)"),
  ];

  for (const query of mediaQueries) {
    query.addEventListener("change", onChange);
  }

  return () => {
    for (const query of mediaQueries) {
      query.removeEventListener("change", onChange);
    }
  };
};

const noticeCopy: Record<PwaUpdateNoticeKind, { title: string; description: string }> = {
  checking: {
    title: "发现新版本",
    description: "正在应用更新，稍后会自动刷新。",
  },
  updated: {
    title: "EdgeEver 已更新",
    description: "当前应用已是最新版本。",
  },
  "reload-required": {
    title: "新版本已就绪",
    description: "刷新后即可使用最新功能。",
  },
};

const getNoticeDescription = (notice: Notice, fallbackDescription: string) => {
  if (notice.kind === "updated" && notice.buildLabel) {
    return `当前应用已是最新版本（${notice.buildLabel}）。`;
  }

  return fallbackDescription;
};

export const PwaUpdateNotice = () => {
  const [displayMode, setDisplayMode] = useState(() => getDisplayMode());
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const syncDisplayMode = () => setDisplayMode(getDisplayMode());
    return watchDisplayMode(syncDisplayMode);
  }, []);

  useEffect(() => {
    if (!displayMode.visible) {
      return;
    }

    const buildLabel = __EDGEEVER_BUILD_LABEL__;

    if (
      consumePwaUpdateReloadPending() ||
      consumePwaBuildUpdate(__EDGEEVER_BUILD_ID__, { notifyWhenMissingBaseline: true })
    ) {
      setNotice({ buildLabel, id: Date.now(), kind: "updated" });
    }

    const handleNotice = (event: Event) => {
      const { buildLabel: eventBuildLabel, kind } = (event as PwaUpdateNoticeEvent).detail;
      setNotice({ buildLabel: eventBuildLabel ?? buildLabel, id: Date.now(), kind });
    };

    window.addEventListener(PWA_UPDATE_NOTICE_EVENT, handleNotice);
    return () => window.removeEventListener(PWA_UPDATE_NOTICE_EVENT, handleNotice);
  }, [displayMode.visible]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const copy = useMemo(() => (notice ? noticeCopy[notice.kind] : null), [notice]);

  if (!displayMode.visible || !notice || !copy) {
    return null;
  }

  const isReloadRequired = notice.kind === "reload-required";

  return (
    <div
      className={cn(
        "fixed z-[80] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white/95 p-3 text-slate-900 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur",
        displayMode.isDesktop
          ? "right-5 top-5 w-[22rem]"
          : "inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))]"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            notice.kind === "updated" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
          )}
          aria-hidden="true"
        >
          {notice.kind === "updated" ? <CheckCircle2 className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{copy.title}</div>
          <div className="mt-0.5 text-xs leading-5 text-slate-500">{getNoticeDescription(notice, copy.description)}</div>
          {isReloadRequired ? (
            <Button className="mt-2" size="sm" variant="solid" onClick={() => window.location.reload()}>
              立即刷新
            </Button>
          ) : null}
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          type="button"
          aria-label="关闭更新通知"
          onClick={() => setNotice(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
