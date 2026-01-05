const fs = require('fs');
const path = require('path');

const blogDir = './content/blog/ja';

// 画像指示の内容からファイル名を生成
function generateFilename(articleSlug, description) {
  // 説明から適切なファイル名を生成
  // 例: "ReRank AIのトップページで「今すぐ始める」ボタンが表示されている画面"
  // → "getting-started-top-page.png"
  
  // 説明を簡潔にする
  let filename = description
    .toLowerCase()
    .replace(/[「」『』（）()]/g, '') // 括弧を削除
    .replace(/[、。，．]/g, '') // 句読点を削除
    .replace(/\s+/g, '-') // スペースをハイフンに
    .replace(/[^\w-]/g, '') // 英数字とハイフン以外を削除
    .substring(0, 50); // 長さを制限
  
  // 記事slugを先頭に追加
  return `${articleSlug}-${filename}.png`;
}

// 記事内の画像指示にファイル名を追加
function addImageFilenames(articlePath) {
  const articleSlug = path.basename(articlePath, '.md');
  let content = fs.readFileSync(articlePath, 'utf8');
  
  // 画像指示のパターン: *画像の内容: [説明]*
  const pattern = /\*画像の内容: ([^\*]+)\*/g;
  let match;
  let modified = false;
  
  while ((match = pattern.exec(content)) !== null) {
    const description = match[1].trim();
    const fullMatch = match[0];
    const index = match.index;
    
    // 既にファイル名が記載されているか確認
    const afterMatch = content.substring(index + fullMatch.length, index + fullMatch.length + 100);
    if (afterMatch.includes('*画像ファイル名:')) {
      continue; // 既にファイル名がある場合はスキップ
    }
    
    // ファイル名を生成
    const filename = generateFilename(articleSlug, description);
    
    // 画像指示の直後にファイル名を追加
    const insertPosition = index + fullMatch.length;
    const before = content.substring(0, insertPosition);
    const after = content.substring(insertPosition);
    
    // ファイル名を追加
    const newContent = before + '\n*画像ファイル名: ' + filename + '*\n' + after;
    content = newContent;
    modified = true;
    
    // パターンを再実行するために位置を調整
    pattern.lastIndex = insertPosition + filename.length + 30;
  }
  
  if (modified) {
    fs.writeFileSync(articlePath, content, 'utf8');
    console.log(`✅ Updated: ${articleSlug}.md`);
    return true;
  }
  
  return false;
}

// メイン処理
function processAllArticles() {
  if (!fs.existsSync(blogDir)) {
    console.log(`⚠️  Blog directory not found: ${blogDir}`);
    return;
  }

  const articleFiles = fs.readdirSync(blogDir).filter(file => 
    file.endsWith('.md')
  );

  console.log(`\n📝 Processing ${articleFiles.length} article(s)...\n`);

  let updatedCount = 0;
  for (const articleFile of articleFiles) {
    const articlePath = path.join(blogDir, articleFile);
    if (addImageFilenames(articlePath)) {
      updatedCount++;
    }
  }

  console.log(`\n✅ Done! Updated ${updatedCount} article(s).`);
  console.log(`\n💡 Note: Please review and adjust filenames if needed.`);
}

processAllArticles();

