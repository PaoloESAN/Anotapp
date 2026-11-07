function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatInline(line: string): string {
    let out = escapeHtml(line);

    // Inline code: `code`
    out = out.replace(
        /`([^`]+)`/g,
        '<code class="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-zinc-800/80 font-mono text-[0.9em] text-indigo-600 dark:text-indigo-400">$1</code>'
    );

    // Links: [label](https://...)
    out = out.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">$1</a>'
    );

    // Bold + Italic: ***text***
    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");

    // Bold: **text** or __text__
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong class="font-bold">$1</strong>');

    // Italic: *text* or _text_
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em class="italic">$1</em>');
    out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em class="italic">$1</em>');

    // Strikethrough: ~~text~~
    out = out.replace(/~~([^~]+)~~/g, '<del class="line-through opacity-75">$1</del>');

    return out;
}

export function renderMarkdown(raw: string): string {
    if (!raw) return "";

    const lines = raw.split(/\r?\n/);
    const htmlBlocks: string[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let listItems: string[] = [];
    let orderedListItems: string[] = [];

    const flushLists = () => {
        if (listItems.length > 0) {
            htmlBlocks.push(
                `<ul class="list-none pl-1 space-y-1 my-1">${listItems.join("")}</ul>`
            );
            listItems = [];
        }
        if (orderedListItems.length > 0) {
            htmlBlocks.push(
                `<ol class="list-none pl-1 space-y-1 my-1">${orderedListItems.join("")}</ol>`
            );
            orderedListItems = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code fence ```
        if (line.trim().startsWith("```")) {
            flushLists();
            if (inCodeBlock) {
                htmlBlocks.push(
                    `<pre class="p-2.5 my-1.5 rounded-lg bg-slate-900 dark:bg-zinc-950 text-slate-100 font-mono text-[0.85em] overflow-x-auto border border-slate-800"><code>${escapeHtml(
                        codeBlockLines.join("\n")
                    )}</code></pre>`
                );
                codeBlockLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // Horizontal rule
        if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
            flushLists();
            htmlBlocks.push('<hr class="my-2 border-slate-300/60 dark:border-zinc-700/60" />');
            continue;
        }

        // Headings
        const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
        if (headingMatch) {
            flushLists();
            const level = headingMatch[1].length;
            const content = formatInline(headingMatch[2]);
            const sizeClass =
                level === 1
                    ? "text-[1.35em] font-extrabold tracking-tight mt-1 mb-0.5"
                    : level === 2
                      ? "text-[1.2em] font-bold tracking-tight mt-1 mb-0.5"
                      : level === 3
                        ? "text-[1.1em] font-semibold mt-0.5"
                        : "text-[1em] font-semibold opacity-90";
            htmlBlocks.push(`<div class="${sizeClass}">${content}</div>`);
            continue;
        }

        // Blockquote
        const quoteMatch = line.match(/^>\s?(.*)$/);
        if (quoteMatch) {
            flushLists();
            htmlBlocks.push(
                `<blockquote class="border-l-3 border-primary/60 pl-2.5 italic opacity-85 my-1">${formatInline(
                    quoteMatch[1]
                )}</blockquote>`
            );
            continue;
        }

        // Task list: - [ ] or - [x]
        const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
            const checked = taskMatch[1].toLowerCase() === "x";
            const checkbox = checked
                ? '<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-primary text-primary-foreground text-[10px] font-bold align-middle">✓</span>'
                : '<span class="inline-block w-3.5 h-3.5 rounded border border-slate-400 dark:border-zinc-500 align-middle"></span>';
            listItems.push(
                `<li class="flex items-start gap-2"><span class="mt-1 select-none shrink-0">${checkbox}</span><span class="min-w-0 flex-1 ${
                    checked ? "line-through opacity-60" : ""
                }">${formatInline(taskMatch[2])}</span></li>`
            );
            continue;
        }

        // Unordered list: - item or * item
        const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
        if (ulMatch) {
            if (orderedListItems.length > 0) flushLists();
            listItems.push(
                `<li class="flex items-start gap-2"><span class="select-none shrink-0 font-bold opacity-80">•</span><span class="min-w-0 flex-1">${formatInline(
                    ulMatch[1]
                )}</span></li>`
            );
            continue;
        }

        // Ordered list: 1. item
        const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (olMatch) {
            if (listItems.length > 0) flushLists();
            orderedListItems.push(
                `<li class="flex items-start gap-1.5"><span class="select-none shrink-0 font-semibold opacity-80">${olMatch[1]}.</span><span class="min-w-0 flex-1">${formatInline(
                    olMatch[2]
                )}</span></li>`
            );
            continue;
        }

        flushLists();

        if (line.trim() === "") {
            htmlBlocks.push('<div class="h-2"></div>');
        } else {
            htmlBlocks.push(`<div>${formatInline(line)}</div>`);
        }
    }

    if (inCodeBlock && codeBlockLines.length > 0) {
        htmlBlocks.push(
            `<pre class="p-2.5 my-1.5 rounded-lg bg-slate-900 dark:bg-zinc-950 text-slate-100 font-mono text-[0.85em] overflow-x-auto border border-slate-800"><code>${escapeHtml(
                codeBlockLines.join("\n")
            )}</code></pre>`
        );
    }

    flushLists();
    return htmlBlocks.join("");
}
