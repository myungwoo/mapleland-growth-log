import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '메이플랜드 성장 기록',
  description: '레벨 · 경험치 · 메소를 가끔 적어 두면 성장 추세와 목표 도달 예상일을 보여 줍니다.',
};

/*
 * 첫 페인트 전에 테마를 정한다. React 가 뜬 뒤에 정하면 라이트로 그렸다가 다크로 바뀌며 번쩍인다.
 * `ml:theme` 은 다른 유틸과 공유하는 키다. 'light' · 'dark' 만 반영하고, 'system' 이나 모르는
 * 값은 시스템 설정을 따른다 (그 값을 고치지도 않는다).
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('ml:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Pretendard — 오픈소스 한글 글꼴. 쓰는 글자만 내려받는 동적 서브셋 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
