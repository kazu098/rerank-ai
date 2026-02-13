# ブログ画像管理ワークフロー

ブログ記事に使用する画像を効率的に管理・最適化するためのワークフローです。

## 問題点

- スクリーンショットを撮った後の名前変更が手間
- リサイズが手間
- ファイルサイズが大きすぎるとページ速度に影響
- SEO対策として画像最適化が必要

## 推奨ワークフロー

### 方法1: 自動化スクリプト（推奨）

画像を自動的にリサイズ・最適化するスクリプトを作成します。

#### 必要なツール

- **ImageMagick** または **sharp** (Node.js)
- **imagemin** (画像圧縮)

#### セットアップ

```bash
# ImageMagickをインストール（macOS）
brew install imagemagick

# または sharpを使用（Node.js）
npm install --save-dev sharp imagemin imagemin-mozjpeg imagemin-pngquant
```

#### 自動化スクリプト

`scripts/optimize-images.js`を作成：

```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = './images/raw';
const outputDir = './public/blog-images';

// 画像を最適化してリサイズ
async function optimizeImage(inputPath, outputPath, maxWidth = 1200) {
  try {
    await sharp(inputPath)
      .resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(outputPath);
    
    const stats = await sharp(outputPath).metadata();
    const fileSize = fs.statSync(outputPath).size;
    
    console.log(`✓ ${path.basename(outputPath)}: ${stats.width}x${stats.height}, ${(fileSize / 1024).toFixed(2)}KB`);
  } catch (error) {
    console.error(`✗ Error processing ${inputPath}:`, error);
  }
}

// ディレクトリ内の全画像を処理
async function processAllImages() {
  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory ${inputDir} does not exist`);
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(inputDir);
  const imageFiles = files.filter(file => 
    /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
  );

  for (const file of imageFiles) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    await optimizeImage(inputPath, outputPath);
  }

  console.log(`\n✓ Processed ${imageFiles.length} images`);
}

processAllImages();
```

#### package.jsonにスクリプトを追加

```json
{
  "scripts": {
    "optimize-images": "node scripts/optimize-images.js"
  }
}
```

#### 使用方法

1. スクリーンショットを`images/raw/`に保存（任意の名前でOK）
2. `npm run optimize-images`を実行
3. 最適化された画像が`public/blog-images/`に生成される

### 方法2: 手動最適化ツール（簡単）

#### macOS: ImageOptim（無料）

1. [ImageOptim](https://imageoptim.com/mac)をインストール
2. スクリーンショットを撮る
3. ImageOptimにドラッグ&ドロップ
4. 自動的に最適化される

#### オンラインツール

- **Squoosh** (https://squoosh.app/) - Google製の画像最適化ツール
- **TinyPNG** (https://tinypng.com/) - PNG/JPEG圧縮

### 方法3: Next.js Image最適化を活用

Next.jsの`next/image`コンポーネントを使用すると、自動的に画像を最適化してくれます。

#### ブログ記事での使用例

```tsx
import Image from 'next/image';

<Image
  src="/blog-images/example.png"
  alt="説明"
  width={1200}
  height={675}
  quality={85}
/>
```

## ファイル命名規則

### 推奨命名規則

```
{記事のslug}-{説明}-{番号}.{拡張子}
```

例：
- `getting-started-top-page.png`
- `ahrefs-dashboard.png`
- `ranking-drop-impact-chart.png`

### 自動リネームスクリプト

`scripts/rename-images.js`を作成：

```javascript
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function renameImages(directory) {
  const files = fs.readdirSync(directory);
  const imageFiles = files.filter(file => 
    /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
  );

  imageFiles.forEach((file, index) => {
    const oldPath = path.join(directory, file);
    const ext = path.extname(file);
    const newName = `image-${String(index + 1).padStart(2, '0')}${ext}`;
    const newPath = path.join(directory, newName);
    
    rl.question(`Rename "${file}" to "${newName}"? (y/n): `, (answer) => {
      if (answer.toLowerCase() === 'y') {
        fs.renameSync(oldPath, newPath);
        console.log(`✓ Renamed: ${file} → ${newName}`);
      }
    });
  });
}

const dir = process.argv[2] || './images/raw';
renameImages(dir);
```

## 画像サイズの推奨値

### ブログ記事用画像

- **幅**: 最大1200px（Retinaディスプレイ対応）
- **ファイルサイズ**: 200KB以下（推奨: 100KB以下）
- **フォーマット**: 
  - 写真: JPEG（品質85%）
  - スクリーンショット/図表: PNG（圧縮レベル9）
  - 可能であればWebP（より小さいファイルサイズ）

### 最適化チェックリスト

- [ ] 幅が1200px以下か
- [ ] ファイルサイズが200KB以下か
- [ ] alt属性が適切に設定されているか
- [ ] ファイル名が意味のある名前か
- [ ] Next.js Imageコンポーネントを使用しているか

## 推奨ワークフロー（最も簡単）

### ステップ1: スクリーンショットを撮る

- macOS: `Cmd + Shift + 4`で範囲選択
- または、専用ツール（CleanShot X、Snagitなど）を使用

### ステップ2: ファイル名を変更して保存

**重要**: この時点で適切なファイル名に変更することを推奨します。

推奨命名規則：
```
{記事のslug}-{説明}.{拡張子}
```

例：
- `getting-started-top-page.png`（記事slug: `getting-started`）
- `ahrefs-comparison-dashboard.png`（記事slug: `ahrefs-comparison`）
- `ranking-drop-impact-chart.png`（記事slug: `ranking-drop-causes`）

**ファイル名変更のコツ**:
- 記事のslug（URLの最後の部分）を最初に含める
- 画像の内容を簡潔に説明する（ハイフン区切り）
- 記事のslugは、記事ファイル名から取得（例: `getting-started.md` → slugは `getting-started`）

### ステップ3: `images/raw/`に保存

- 適切なファイル名に変更した画像を`images/raw/`ディレクトリに保存

### ステップ4: 自動最適化

```bash
npm run optimize-images
```

これで、`images/raw/`内の画像が自動的に：
- 幅1200px以下にリサイズ
- 品質85%で最適化
- `public/blog-images/`に出力（ファイル名はそのまま）

### ステップ5: 記事に画像を自動挿入（オプション）

画像を記事に自動で挿入するスクリプトを使用できます：

```bash
npm run insert-images
```

このスクリプトは：
- 記事内の画像指示（`*画像ファイル名: [filename]*`）を見つける
- 指定されたファイル名の画像が`public/blog-images/`に存在するか確認
- 画像指示の直後に画像マークダウンを自動挿入

**画像指示の書き方**:
記事内に以下の形式で画像指示を記載してください：

```markdown
*画像の内容: ReRank AIのトップページで「今すぐ始める」ボタンが表示されている画面*
*画像ファイル名: getting-started-top-page.png*
*画像のサイズ: 幅1200px、高さは自動*
*ハイライト: 「今すぐ始める」ボタンを赤い枠で囲む*
```

**注意**: 
- `*画像ファイル名: [filename]*` の形式でファイル名を指定してください
- 指定されたファイル名の画像が`public/blog-images/`に存在する必要があります
- 既に画像マークダウンがある場合はスキップされます

### ステップ6: 手動で記事に画像を追加（推奨）

自動挿入がうまくいかない場合は、手動で追加してください：

```markdown
![説明](blog-images/getting-started-top-page.png)
```

**alt属性の書き方**:
- 画像の内容を簡潔に説明
- キーワードを自然に含める
- 装飾的な画像の場合は空でもOK（`![ ]`）

## ワークフロー例（詳細）

### 例: 「getting-started.md」の記事に画像を追加する場合

1. **スクリーンショットを撮る**
   - ReRank AIのトップページをキャプチャ

2. **ファイル名を変更**
   - `スクリーンショット 2026-01-15 10.30.45.png` → `getting-started-top-page.png`

3. **`images/raw/`に保存**
   - `images/raw/getting-started-top-page.png`として保存

4. **自動最適化**
   ```bash
   npm run optimize-images
   ```
   - `public/blog-images/getting-started-top-page.png`が生成される

5. **記事に追加**
   ```markdown
   ![ReRank AIのトップページ](blog-images/getting-started-top-page.png)
   ```

## 自動化の完全版

`scripts/process-blog-images.sh`を作成：

```bash
#!/bin/bash

# 画像処理スクリプト
# 使用方法: ./scripts/process-blog-images.sh [記事のslug]

ARTICLE_SLUG=$1
RAW_DIR="./images/raw"
OUTPUT_DIR="./public/blog-images"

# ディレクトリが存在しない場合は作成
mkdir -p "$RAW_DIR"
mkdir -p "$OUTPUT_DIR"

echo "📸 Processing images for article: $ARTICLE_SLUG"
echo ""

# rawディレクトリ内の画像を処理
for file in "$RAW_DIR"/*.{png,jpg,jpeg}; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    extension="${filename##*.}"
    new_filename="${ARTICLE_SLUG}-${filename%.*}.${extension}"
    output_path="$OUTPUT_DIR/$new_filename"
    
    # ImageMagickでリサイズ・最適化
    convert "$file" \
      -resize 1200x1200\> \
      -quality 85 \
      -strip \
      "$output_path"
    
    # ファイルサイズを確認
    size=$(du -h "$output_path" | cut -f1)
    echo "✓ Processed: $new_filename ($size)"
  fi
done

echo ""
echo "✅ Done! Images are in $OUTPUT_DIR"
```

## 推奨ツール

### スクリーンショットツール

- **CleanShot X** (macOS, 有料): 自動的にファイル名を設定、アノテーション機能
- **Snagit** (Windows/Mac, 有料): 高度な編集機能
- **Shottr** (macOS, 無料): 軽量で高速

### 画像最適化ツール

- **ImageOptim** (macOS, 無料): ドラッグ&ドロップで最適化
- **Squoosh** (Web, 無料): Google製、高品質
- **TinyPNG** (Web, 無料): PNG/JPEG圧縮

## まとめ

**最も効率的な方法**:

1. **スクリーンショットを撮る**: `Cmd + Shift + 4`など
2. **ファイル名を変更**: 適切な名前に変更（`{記事slug}-{説明}.png`）
3. **`images/raw/`に保存**: 変更したファイル名で保存
4. **自動最適化**: `npm run optimize-images`で一括処理
5. **記事に追加**: `![alt text](blog-images/filename.png)`

**注意点**:
- ファイル名の変更は手動で行う必要があります（画像の内容を自動判断するのは困難なため）
- ファイル名は記事のslugを含めると管理しやすくなります
- リサイズ・最適化は自動で行われるため、手動での作業は最小限です

このワークフローにより、画像管理の手間を最小限に抑えられます。

