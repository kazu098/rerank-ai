const fs = require('fs');
const path = require('path');

const imagesDir = './public/blog-images';
const blogDir = './content/blog/ja';

// 記事のslugを取得（ファイル名から）
function getArticleSlug(filename) {
  return path.basename(filename, '.md');
}

// 画像ファイルから記事のslugを推測
function guessArticleSlugFromImage(imageFilename) {
  // ファイル名の形式: {記事slug}-{説明}.png
  const parts = path.basename(imageFilename, path.extname(imageFilename)).split('-');
  // 最初の部分が記事のslugの可能性が高い
  // ただし、slugが複数の単語で構成されている場合もある
  // 例: getting-started-top-page.png → getting-started
  
  // 一般的なslugのパターンを試す
  const possibleSlugs = [];
  
  // 1単語目だけ
  if (parts.length > 0) {
    possibleSlugs.push(parts[0]);
  }
  
  // 2単語目まで
  if (parts.length > 1) {
    possibleSlugs.push(`${parts[0]}-${parts[1]}`);
  }
  
  // 3単語目まで
  if (parts.length > 2) {
    possibleSlugs.push(`${parts[0]}-${parts[1]}-${parts[2]}`);
  }
  
  return possibleSlugs;
}

// 記事内の画像指示を見つける（ファイル名を含む形式）
function findImagePlaceholders(content) {
  // 画像指示のパターン: *画像ファイル名: [filename]*
  const pattern = /\*画像ファイル名: ([^\*]+)\*/g;
  const placeholders = [];
  let match;
  
  while ((match = pattern.exec(content)) !== null) {
    const filename = match[1].trim();
    // 画像指示の前後を確認して、説明を取得
    const beforeMatch = content.substring(0, match.index);
    const imageContentMatch = beforeMatch.match(/\*画像の内容: ([^\*]+)\*/);
    const description = imageContentMatch ? imageContentMatch[1].trim() : filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
    
    placeholders.push({
      fullMatch: match[0],
      filename: filename,
      description: description,
      index: match.index
    });
  }
  
  return placeholders;
}

// 画像指示の後に画像マークダウンを挿入
function insertImageMarkdown(content, imageFilename, description, placeholderIndex) {
  // 画像ファイル名のパターンを探す
  const pattern = /\*画像ファイル名: ([^\*]+)\*/g;
  let match;
  let count = 0;
  
  // 指定されたインデックスのマッチを見つける
  while ((match = pattern.exec(content)) !== null) {
    if (count === placeholderIndex && match[1].trim() === imageFilename) {
      // 画像マークダウンを生成
      const imageMarkdown = `![${description}](blog-images/${imageFilename})`;
      
      // 画像指示の直後に画像マークダウンを挿入
      const insertPosition = match.index + match[0].length;
      const before = content.substring(0, insertPosition);
      const after = content.substring(insertPosition);
      
      // 既に画像マークダウンがある場合はスキップ
      if (after.trim().startsWith('![')) {
        return { content, inserted: false };
      }
      
      return { 
        content: before + '\n\n' + imageMarkdown + '\n' + after,
        inserted: true
      };
    }
    count++;
  }
  
  return { content, inserted: false };
}

// メイン処理
function insertImages() {
  if (!fs.existsSync(imagesDir)) {
    console.log(`⚠️  Images directory not found: ${imagesDir}`);
    return;
  }

  if (!fs.existsSync(blogDir)) {
    console.log(`⚠️  Blog directory not found: ${blogDir}`);
    return;
  }

  // 画像ファイルを取得
  const imageFiles = fs.readdirSync(imagesDir).filter(file => 
    /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
  );

  if (imageFiles.length === 0) {
    console.log(`⚠️  No images found in ${imagesDir}`);
    return;
  }

  // 記事ファイルを取得
  const articleFiles = fs.readdirSync(blogDir).filter(file => 
    file.endsWith('.md')
  );

  console.log(`\n📸 Found ${imageFiles.length} image(s) and ${articleFiles.length} article(s)\n`);

  // 各記事について処理
  for (const articleFile of articleFiles) {
    const articlePath = path.join(blogDir, articleFile);
    let content = fs.readFileSync(articlePath, 'utf8');
    
    // 画像指示を探す（ファイル名を含む形式）
    const placeholders = findImagePlaceholders(content);
    
    if (placeholders.length === 0) {
      continue;
    }

    console.log(`📝 Processing: ${articleFile} (${placeholders.length} placeholder(s))`);

    // 各画像指示について処理
    for (let i = 0; i < placeholders.length; i++) {
      const placeholder = placeholders[i];
      const imageFilename = placeholder.filename;
      
      // 画像ファイルが存在するか確認
      const imagePath = path.join(imagesDir, imageFilename);
      if (!fs.existsSync(imagePath)) {
        console.log(`   ⚠️  Image not found: ${imageFilename}`);
        continue;
      }

      // 画像を挿入
      const result = insertImageMarkdown(content, imageFilename, placeholder.description, i);
      
      if (result.inserted) {
        content = result.content;
        console.log(`   ✅ Inserted: ${imageFilename}`);
      } else {
        console.log(`   ⚠️  Image already exists or could not insert: ${imageFilename}`);
      }
    }

    // 変更があった場合はファイルを保存
    const originalContent = fs.readFileSync(articlePath, 'utf8');
    if (content !== originalContent) {
      fs.writeFileSync(articlePath, content, 'utf8');
      console.log(`   💾 Saved: ${articleFile}`);
    }
  }

  console.log(`\n✅ Done!`);
}

// コマンドライン引数で特定の画像ファイルを指定可能
const args = process.argv.slice(2);
if (args.length > 0) {
  // 特定の画像ファイルのみ処理
  console.log(`Processing specific image(s): ${args.join(', ')}`);
} else {
  // すべての画像を処理
  insertImages();
}

