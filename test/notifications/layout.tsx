export const metadata = {
  title: 'Test Notification - ReRank AI',
  description: 'メール通知のテスト用ページ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

