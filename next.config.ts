import type { NextConfig } from "next";
import path from "path";

// NEXT_PUBLIC_* 는 브라우저에 그대로 노출되는 공개값(Supabase anon key는
// RLS로 보호되는 설계상 공개키)이라 여기 하드코딩해도 비밀 유출이 아니다.
// service_role/CRON_SECRET 등 실제 비밀값은 여기 넣지 않는다.
const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  // 상위 폴더의 무관한 package-lock.json 때문에 standalone 빌드가
  // 워크스페이스 루트를 잘못 추론해 전체 경로를 통째로 복사하는 문제 방지.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: __dirname },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://zhtxxhiyihmhfjdnttey.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodHh4aGl5aWhtaGZqZG50dGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODM5OTUsImV4cCI6MjA5OTc1OTk5NX0.r3SCuGtH60dnPX8raBeWrIRIjccIIQ9ReZDPLKfqYxE",
    // 매직링크 복귀 주소를 vibe 도메인으로 고정한다. 미설정 시 터널 뒤 host 헤더가
    // 내부 컨테이너 주소로 잡혀 로그인 링크가 엉뚱한 곳으로 돌아간다.
    NEXT_PUBLIC_SITE_URL: "https://q-radar.egnis.net",

    // --- 이 빌드는 vibe(회사 Google 게이트 뒤) 전용 설정이다 ---
    // 게이트가 사내 인원을 이미 인증하므로 앱 로그인을 없애고, 이메일 발송도 중단한다.
    // 되돌리려면 두 값을 반대로 두고 재배포 (docs/auth-magic-link.md).
    AUTH_VIBE_GATE_ONLY: "true",
    AUTH_MAGIC_LINK_ENABLED: "false",
  },
};

export default nextConfig;
