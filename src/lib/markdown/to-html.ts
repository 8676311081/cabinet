import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

/**
 * Convert [[Wiki Links]] into safe anchor nodes after markdown parsing.
 */
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const SKIP_WIKI_LINK_TAGS = new Set(["a", "code", "pre", "script", "style"]);

function slugifyWikiPageName(pageName: string): string {
  return pageName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createWikiLinkNode(pageName: string): HastNode {
  return {
    type: "element",
    tagName: "a",
    properties: {
      "data-wiki-link": "true",
      "data-page-name": pageName,
      href: `#page:${slugifyWikiPageName(pageName)}`,
      className: ["wiki-link"],
    },
    children: [{ type: "text", value: pageName }],
  };
}

function splitWikiLinksFromText(value: string): HastNode[] {
  const nodes: HastNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(WIKI_LINK_PATTERN)) {
    const pageName = match[1];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, matchIndex) });
    }

    nodes.push(createWikiLinkNode(pageName));
    lastIndex = matchIndex + match[0].length;
  }

  if (nodes.length === 0) {
    return [{ type: "text", value }];
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return nodes;
}

function rewriteWikiLinks(node: HastNode): void {
  if (!node.children || node.children.length === 0) {
    return;
  }

  const nextChildren: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "element" && child.tagName && SKIP_WIKI_LINK_TAGS.has(child.tagName)) {
      nextChildren.push(child);
      continue;
    }

    if (child.type === "text" && typeof child.value === "string") {
      nextChildren.push(...splitWikiLinksFromText(child.value));
      continue;
    }

    rewriteWikiLinks(child);
    nextChildren.push(child);
  }

  node.children = nextChildren;
}

function rehypeWikiLinks() {
  return (tree: HastNode) => {
    rewriteWikiLinks(tree);
  };
}

/**
 * Post-process HTML to fix task list structure for Tiptap compatibility.
 * remark-gfm outputs: <li><input type="checkbox" ...> text</li>
 * Tiptap expects:     <li data-type="taskItem" data-checked="..."><label><input ...></label><div><p>text</p></div></li>
 * And the parent <ul> needs class="task-list" and data-type="taskList".
 */
function fixTaskListHtml(html: string): string {
  // Convert task list <ul> with contains-task-list class
  html = html.replace(
    /<ul class="contains-task-list">/g,
    '<ul data-type="taskList" class="task-list">'
  );

  // Convert each task list item to Tiptap's expected structure
  html = html.replace(
    /<li class="task-list-item">\s*<input type="checkbox"([^>]*)>\s*([\s\S]*?)(?=<\/li>)/g,
    (_match, attrs: string, content: string) => {
      const checked = attrs.includes("checked");
      const cleanContent = content.trim();
      return `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? " checked" : ""}></label><div><p>${cleanContent}</p></div>`;
    }
  );

  return html;
}

/**
 * Rewrite relative URLs (./file.pdf, ./image.png) to /api/assets/{pagePath}/file
 * and convert PDF links to inline embedded viewers.
 */
function resolveRelativeUrls(html: string, pagePath: string): string {
  // Get the directory path (strip trailing filename if any)
  const dirPath = pagePath;

  // Rewrite relative hrefs: href="./file.pdf" → href="/api/assets/dir/file.pdf"
  html = html.replace(
    /href="\.\/([^"]+)"/g,
    (_match, file: string) => `href="/api/assets/${dirPath}/${file}"`
  );

  // Rewrite relative src: src="./image.png" → src="/api/assets/dir/image.png"
  html = html.replace(
    /src="\.\/([^"]+)"/g,
    (_match, file: string) => `src="/api/assets/${dirPath}/${file}"`
  );

  // Mark PDF links with a data attribute so the editor can handle them
  html = html.replace(
    /<a([^>]*?)href="(\/api\/assets\/[^"]+\.pdf)"([^>]*?)>/gi,
    (_match, before: string, url: string, after: string) => {
      return `<a${before}href="${url}"${after} data-pdf-link="true">`;
    }
  );

  return html;
}

export async function markdownToHtml(markdown: string, pagePath?: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    // TODO(security): install rehype-sanitize and replace this trusted-local fallback
    // with an explicit allowlist for embedded media tags such as video and iframe.
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeWikiLinks)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  let html = String(result);

  // Post-process task lists for Tiptap compatibility
  html = fixTaskListHtml(html);

  // Resolve relative URLs if page path is provided
  if (pagePath) {
    html = resolveRelativeUrls(html, pagePath);
  }

  return html;
}
