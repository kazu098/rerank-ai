"use client";

import { useState, useRef } from "react";
import { Navigation } from "@/components/landing/Navigation";
import { Footer } from "@/components/landing/Footer";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

interface UploadedFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

export default function ContactPage() {
  const t = useTranslations("contact");
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_FILES = 5;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // ファイル数のチェック
    if (files.length + selectedFiles.length > MAX_FILES) {
      setErrorMessage(
        locale === 'ja' 
          ? `最大${MAX_FILES}ファイルまでアップロードできます`
          : `Maximum ${MAX_FILES} files allowed`
      );
      return;
    }

    // ファイルサイズのチェック
    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage(
          locale === 'ja'
            ? `ファイル "${file.name}" は10MBを超えています`
            : `File "${file.name}" exceeds 10MB`
        );
        return;
      }
    }

    setFiles((prev) => [...prev, ...selectedFiles]);
    setErrorMessage("");
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      // ファイルをアップロード
      let fileUrls: UploadedFile[] = [];
      if (files.length > 0) {
        setIsUploading(true);
        const formDataToUpload = new FormData();
        files.forEach((file) => {
          formDataToUpload.append('files', file);
        });

        const uploadResponse = await fetch("/api/contact/upload", {
          method: "POST",
          body: formDataToUpload,
        });

        if (!uploadResponse.ok) {
          const uploadError = await uploadResponse.json();
          throw new Error(uploadError.error || (locale === 'ja' ? "ファイルのアップロードに失敗しました" : "Failed to upload files"));
        }

        const uploadData = await uploadResponse.json();
        fileUrls = uploadData.files;
        setUploadedFiles(fileUrls);
        setIsUploading(false);
      }

      // お問い合わせを送信
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          locale,
          files: fileUrls,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("methods.form.error"));
      }

      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
      setFiles([]);
      setUploadedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("[Contact] Error:", error);
      setSubmitStatus("error");
      setErrorMessage(error.message || t("methods.form.error"));
      setIsUploading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 件名の選択肢
  const subjectOptions = locale === 'ja' 
    ? [
        { value: "", label: "選択してください" },
        { value: "general", label: "一般的なお問い合わせ" },
        { value: "technical", label: "技術的な問題・バグ報告" },
        { value: "billing", label: "料金・請求に関して" },
        { value: "feature", label: "機能リクエスト・改善提案" },
        { value: "account", label: "アカウントに関して" },
        { value: "other", label: "その他" },
      ]
    : [
        { value: "", label: "Select an option" },
        { value: "general", label: "General Inquiry" },
        { value: "technical", label: "Technical Issue / Bug Report" },
        { value: "billing", label: "Billing / Payment" },
        { value: "feature", label: "Feature Request / Suggestion" },
        { value: "account", label: "Account Related" },
        { value: "other", label: "Other" },
      ];

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">{t("title")}</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 mb-6">{t("description")}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("methods.title")}</h2>
            
            {/* メールでのお問い合わせ */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-semibold text-blue-900 mb-3">{t("methods.email.title")}</h3>
              <p className="text-gray-700 mb-4">{t("methods.email.description")}</p>
              <p className="text-lg">
                <a 
                  href={`mailto:${t("methods.email.address")}`}
                  className="text-blue-600 hover:text-blue-800 font-semibold"
                >
                  {t("methods.email.address")}
                </a>
              </p>
              <p className="text-sm text-gray-600 mt-2">{t("methods.email.note")}</p>
            </div>

            {/* お問い合わせフォーム */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">{t("methods.form.title")}</h3>
              <p className="text-gray-700 mb-6">{t("methods.form.description")}</p>

              {/* 成功メッセージ */}
              {submitStatus === "success" && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-green-800 font-medium">{t("methods.form.success")}</p>
                  </div>
                </div>
              )}

              {/* エラーメッセージ */}
              {(submitStatus === "error" || errorMessage) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p className="text-red-800 font-medium">{errorMessage || t("methods.form.error")}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* お名前 */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("methods.form.name")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder={t("methods.form.namePlaceholder")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                  />
                </div>

                {/* メールアドレス */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("methods.form.emailLabel")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder={t("methods.form.emailPlaceholder")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                  />
                </div>

                {/* 件名 */}
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("methods.form.subject")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors bg-white"
                  >
                    {subjectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* メッセージ */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("methods.form.messageLabel")} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    placeholder={t("methods.form.messagePlaceholder")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-y"
                    maxLength={5000}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {formData.message.length} / 5000
                  </p>
                </div>

                {/* ファイルアップロード */}
                <div>
                  <label htmlFor="files" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("methods.form.attachments")} ({locale === 'ja' ? '任意' : 'Optional'})
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="files"
                    name="files"
                    multiple
                    accept="image/*,.pdf,.txt,.md"
                    onChange={handleFileChange}
                    disabled={isSubmitting || isUploading}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {t("methods.form.fileHint")} ({locale === 'ja' ? `最大${MAX_FILES}ファイルまで` : `Maximum ${MAX_FILES} files`}, {t("methods.form.maxSize")})
                  </p>

                  {/* アップロードされたファイル一覧 */}
                  {files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
                        >
                          <div className="flex items-center flex-1 min-w-0">
                            <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            disabled={isSubmitting || isUploading}
                            className="ml-3 text-red-600 hover:text-red-800 disabled:text-gray-400"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 送信ボタン */}
                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploading}
                    className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                      isSubmitting || isUploading
                        ? "bg-gray-400 cursor-not-allowed text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {(isSubmitting || isUploading) ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {isUploading ? t("methods.form.uploading") : t("methods.form.sending")}
                      </span>
                    ) : (
                      t("methods.form.submit")
                    )}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("hours.title")}</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <p className="text-gray-700">
                <strong>{t("hours.support")}</strong> {t("hours.time")}
              </p>
              <p className="text-gray-600 text-sm mt-2">{t("hours.note")}</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("other.title")}</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              {t.raw("other.items").map((item: string, index: number) => (
                <li key={index}>
                  {item.includes("プライバシーポリシー") || item.includes("Privacy Policy") ? (
                    <>
                      {item.split("プライバシーポリシー")[0] || item.split("Privacy Policy")[0]}
                      <a href={`/${locale}/privacy`} className="text-blue-600 hover:text-blue-800 underline">
                        {locale === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}
                      </a>
                      {item.split("プライバシーポリシー")[1] || item.split("Privacy Policy")[1]}
                    </>
                  ) : (
                    item
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
