import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reality Mission Engine | Discord",
  description: "디스코드에서 진행하는 현실 미션 게임 백엔드"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
