import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
  content: string;
  htmlContent: string;
  locale: string;
  parent?: string;
}

const docsDirectory = path.join(process.cwd(), "content", "docs");

export async function getDocPages(locale: string = "ja"): Promise<DocPage[]> {
  const localeDirectory = path.join(docsDirectory, locale);
  
  if (!fs.existsSync(localeDirectory)) {
    return [];
  }

  const getAllFiles = (dir: string, basePath: string = ""): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir);

    list.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(filePath, path.join(basePath, file)));
      } else if (file.endsWith(".md")) {
        const relativePath = path.join(basePath, file.replace(/\.md$/, ""));
        results.push(relativePath);
      }
    });

    return results;
  };

  const filePaths = getAllFiles(localeDirectory);
  
  const allPages = await Promise.all(
    filePaths.map(async (filePath) => {
      const fullPath = path.join(localeDirectory, `${filePath}.md`);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(fileContents);

      // MarkdownをHTMLに変換
      const processedContent = await remark().use(remarkHtml).process(content);
      const htmlContent = processedContent.toString();

      const pathParts = filePath.split(path.sep);
      const slug = pathParts.join("/");
      const parent = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : undefined;

      return {
        slug,
        title: data.title || "",
        description: data.description || "",
        category: data.category || "",
        order: data.order || 0,
        content,
        htmlContent,
        locale,
        parent,
      } as DocPage;
    })
  );

  // カテゴリーとorderでソート
  return allPages.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.order - b.order;
  });
}

export async function getDocPage(
  slug: string,
  locale: string = "ja"
): Promise<DocPage | null> {
  const localeDirectory = path.join(docsDirectory, locale);
  const fullPath = path.join(localeDirectory, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  // MarkdownをHTMLに変換
  const processedContent = await remark().use(remarkHtml).process(content);
  const htmlContent = processedContent.toString();

  const pathParts = slug.split("/");
  const parent = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : undefined;

  return {
    slug,
    title: data.title || "",
    description: data.description || "",
    category: data.category || "",
    order: data.order || 0,
    content,
    htmlContent,
    locale,
    parent,
  } as DocPage;
}

export async function getDocCategories(locale: string = "ja"): Promise<string[]> {
  const pages = await getDocPages(locale);
  const categories = new Set(pages.map((page) => page.category).filter(Boolean));
  return Array.from(categories).sort();
}

export function getDocNavigation(pages: DocPage[]): {
  category: string;
  pages: DocPage[];
}[] {
  const navigation: { [key: string]: DocPage[] } = {};

  pages.forEach((page) => {
    const category = page.category || "その他";
    if (!navigation[category]) {
      navigation[category] = [];
    }
    navigation[category].push(page);
  });

  return Object.entries(navigation)
    .map(([category, pages]) => ({
      category,
      pages: pages.sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

