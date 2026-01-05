const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = './images/raw';
const outputDir = './public/blog-images';

// 画像を最適化してリサイズ
async function optimizeImage(inputPath, outputPath, maxWidth = 1200) {
  try {
    const metadata = await sharp(inputPath).metadata();
    const format = metadata.format;

    let pipeline = sharp(inputPath).resize(maxWidth, null, {
      withoutEnlargement: true,
      fit: 'inside'
    });

    // フォーマットに応じて最適化
    if (format === 'jpeg' || format === 'jpg') {
      pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    } else if (format === 'png') {
      pipeline = pipeline.png({ quality: 85, compressionLevel: 9 });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 85 });
    }

    await pipeline.toFile(outputPath);
    
    const stats = await sharp(outputPath).metadata();
    const fileSize = fs.statSync(outputPath).size;
    const originalSize = fs.statSync(inputPath).size;
    const reduction = ((1 - fileSize / originalSize) * 100).toFixed(1);
    
    console.log(`✓ ${path.basename(outputPath)}: ${stats.width}x${stats.height}, ${(fileSize / 1024).toFixed(2)}KB (${reduction}% reduction)`);
  } catch (error) {
    console.error(`✗ Error processing ${inputPath}:`, error.message);
  }
}

// ディレクトリ内の全画像を処理
async function processAllImages() {
  if (!fs.existsSync(inputDir)) {
    console.log(`Creating input directory: ${inputDir}`);
    fs.mkdirSync(inputDir, { recursive: true });
    console.log(`\n⚠️  Please add images to ${inputDir} and run again.`);
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(inputDir);
  const imageFiles = files.filter(file => 
    /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
  );

  if (imageFiles.length === 0) {
    console.log(`\n⚠️  No images found in ${inputDir}`);
    console.log(`   Please add images and run again.`);
    return;
  }

  console.log(`\n📸 Processing ${imageFiles.length} image(s)...\n`);
  console.log(`📝 Note: File names are preserved. Please rename them manually if needed.\n`);

  for (const file of imageFiles) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    await optimizeImage(inputPath, outputPath);
  }

  console.log(`\n✅ Done! Processed ${imageFiles.length} image(s)`);
  console.log(`   Output directory: ${outputDir}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Rename files in ${outputDir} if needed`);
  console.log(`   2. Add images to your blog post using: ![alt text](blog-images/filename.png)`);
}

processAllImages().catch(console.error);

