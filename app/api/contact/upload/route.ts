import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// ファイルアップロードの設定
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    // ファイル数チェック
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed` },
        { status: 400 }
      );
    }

    const uploadedFiles: Array<{
      url: string;
      name: string;
      type: string;
      size: number;
    }> = [];

    // 各ファイルをチェックしてアップロード
    for (const file of files) {
      // ファイルサイズチェック
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        );
      }

      // ファイルタイプチェック
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type "${file.type}" is not allowed. Allowed types: images (jpg, png, gif), PDF, text files` },
          { status: 400 }
        );
      }

      // Vercel Blob Storageにアップロード
      const blob = await put(
        `contact/${Date.now()}-${file.name}`,
        file,
        {
          access: 'public',
          addRandomSuffix: true,
        }
      );

      uploadedFiles.push({
        url: blob.url,
        name: file.name,
        type: file.type,
        size: file.size,
      });
    }

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
    });
  } catch (error: any) {
    console.error("[Contact Upload API] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}

