import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, Menu } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import documentation from "@/content/game-systems.md?raw";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textFromChildren((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

export function DocsPanel() {
  const [open, setOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const sections = useMemo(
    () =>
      documentation
        .split("\n")
        .filter((line) => line.startsWith("## "))
        .map((line) => {
          const label = line.slice(3).replace(/\*\*/g, "").trim();
          return { label, id: slugify(label) };
        }),
    [],
  );

  const goToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setContentsOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Open game documentation"
          title="Game documentation"
          className="pointer-events-auto relative z-50 rounded-full border-white/25 bg-slate-900/70 text-slate-50 shadow backdrop-blur hover:bg-slate-800/80 hover:text-slate-50"
        >
          <BookOpen aria-hidden />
        </Button>
      </DialogTrigger>

      <DialogContent className="dark h-[min(90dvh,860px)] w-[calc(100vw-1rem)] max-w-6xl gap-0 overflow-hidden rounded-lg border-border bg-background p-0 text-foreground sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base sm:text-lg">GoFish Documentation</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Economy, gameplay systems, and player features
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="relative grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute left-4 top-3 z-20 md:hidden"
            onClick={() => setContentsOpen((value) => !value)}
            aria-expanded={contentsOpen}
            aria-controls="docs-contents"
          >
            <Menu aria-hidden />
            Contents
          </Button>

          <aside
            id="docs-contents"
            className={`${
              contentsOpen ? "flex" : "hidden"
            } absolute inset-y-0 left-0 z-10 w-72 flex-col border-r border-border bg-background pt-14 shadow-xl md:static md:flex md:w-auto md:pt-0 md:shadow-none`}
          >
            <p className="px-5 pb-2 pt-5 text-xs font-semibold uppercase text-muted-foreground">
              Contents
            </p>
            <ScrollArea className="min-h-0 flex-1 px-3 pb-5">
              <nav aria-label="Documentation contents" className="space-y-1">
                {sections.map((section) => (
                  <Button
                    key={section.id}
                    type="button"
                    variant="ghost"
                    onClick={() => goToSection(section.id)}
                    className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left text-xs leading-5 text-muted-foreground hover:text-foreground"
                  >
                    {section.label}
                  </Button>
                ))}
              </nav>
            </ScrollArea>
          </aside>

          <ScrollArea className="min-h-0 bg-card/30">
            <article className="mx-auto max-w-4xl px-5 pb-16 pt-16 text-sm leading-7 sm:px-9 md:pt-8 lg:px-12">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="mb-3 text-2xl font-bold leading-tight sm:text-3xl">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2
                      id={slugify(textFromChildren(children))}
                      className="mb-4 mt-12 scroll-mt-8 border-b border-border pb-3 text-xl font-semibold first:mt-0 sm:text-2xl"
                    >
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3
                      id={slugify(textFromChildren(children))}
                      className="mb-3 mt-8 scroll-mt-8 text-base font-semibold text-foreground sm:text-lg"
                    >
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="mb-2 mt-6 font-semibold text-foreground">{children}</h4>
                  ),
                  p: ({ children }) => <p className="my-3 text-muted-foreground">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-sky-400 underline underline-offset-4 hover:text-sky-300"
                    >
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-4 list-disc space-y-1 pl-6 text-muted-foreground">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-4 list-decimal space-y-1 pl-6 text-muted-foreground">{children}</ol>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-5 border-l-2 border-sky-400 pl-4 text-muted-foreground">
                      {children}
                    </blockquote>
                  ),
                  code: ({ className, children }) =>
                    className ? (
                      <code className="text-xs text-foreground">{children}</code>
                    ) : (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{children}</code>
                    ),
                  pre: ({ children }) => (
                    <pre className="my-5 overflow-x-auto rounded-md border border-border bg-muted/60 p-4 text-xs leading-6">
                      {children}
                    </pre>
                  ),
                  table: ({ children }) => (
                    <ScrollArea className="my-5 w-full rounded-md border border-border">
                      <table className="w-full min-w-max border-collapse text-left text-xs">{children}</table>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  ),
                  thead: ({ children }) => <thead className="bg-muted text-foreground">{children}</thead>,
                  th: ({ children }) => (
                    <th className="border-b border-r border-border px-3 py-2.5 font-semibold last:border-r-0">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-r border-border px-3 py-2 text-muted-foreground last:border-r-0">
                      {children}
                    </td>
                  ),
                  hr: () => <hr className="my-10 border-border" />,
                }}
              >
                {documentation}
              </ReactMarkdown>
            </article>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}