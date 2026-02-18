import type { Metadata } from "next";
import "./globals.css";
import "./watermark.css";

export const metadata: Metadata = {
  title: "途影 | TravelShots Photography",
  description: "风光摄影作品展示，记录走过的每一个地方",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="dark">
      <body
        className="antialiased bg-[#18181b] text-zinc-100"
      >
        {children}
      </body>
    </html>
  );
}
