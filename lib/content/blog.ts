import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";
import remarkGfm from "remark-gfm";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  tags: string[];
  author: string;
  image?: string;
  content: string;
  htmlContent: string;
  locale: string;
}

const blogDirectory = path.join(process.cwd(), "content", "blog");

export async function getBlogPosts(locale: string = "ja"): Promise<BlogPost[]> {
  const localeDirectory = path.join(blogDirectory, locale);
  
  if (!fs.existsSync(localeDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(localeDirectory);
  const allPostsData = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map(async (fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const fullPath = path.join(localeDirectory, fileName);
        const fileContents = fs.readFileSync(fullPath, "utf8");
        const { data, content } = matter(fileContents);

        // MarkdownをHTMLに変換（表をサポート）
        const processedContent = await remark().use(remarkGfm).use(remarkHtml).process(content);
        const htmlContent = processedContent.toString();

        return {
          slug,
          title: data.title || "",
          description: data.description || "",
          date: data.date || "",
          category: data.category || "",
          tags: data.tags || [],
          author: data.author || "ReRank AI",
          image: data.image,
          content,
          htmlContent,
          locale,
        } as BlogPost;
      })
  );

  // 日付でソート（新しい順）
  return allPostsData.sort((a, b) => {
    if (a.date < b.date) {
      return 1;
    } else {
      return -1;
    }
  });
}

export async function getBlogPost(
  slug: string,
  locale: string = "ja"
): Promise<BlogPost | null> {
  const localeDirectory = path.join(blogDirectory, locale);
  const fullPath = path.join(localeDirectory, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  // MarkdownをHTMLに変換（表をサポート）
  const processedContent = await remark().use(remarkGfm).use(remarkHtml).process(content);
  const htmlContent = processedContent.toString();

  return {
    slug,
    title: data.title || "",
    description: data.description || "",
    date: data.date || "",
    category: data.category || "",
    tags: data.tags || [],
    author: data.author || "ReRank AI",
    image: data.image,
    content,
    htmlContent,
    locale,
  } as BlogPost;
}

export async function getBlogCategories(locale: string = "ja"): Promise<string[]> {
  const posts = await getBlogPosts(locale);
  const categories = new Set(posts.map((post) => post.category).filter(Boolean));
  return Array.from(categories).sort();
}

export async function getBlogTags(locale: string = "ja"): Promise<string[]> {
  const posts = await getBlogPosts(locale);
  const tags = new Set(posts.flatMap((post) => post.tags));
  return Array.from(tags).sort();
}

