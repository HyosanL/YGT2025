# YGT 2025

2학년 생도 기태의 모험 — 몰래 하다가 들키기 직전에 멈춰라.

미니게임 모음 (탐지 회피 + 반응/운빨) · 모바일 웹 PWA (세로 모드) · Phaser 3 + TypeScript + Vite
전체 게임 명세는 [YGT2025_SPEC.md](./YGT2025_SPEC.md) 참조.

## 게임 구조

- **1일차부터 시작**, 하루에 메인 퀘스트 1개 (샤워장 노래 / 복도 인사 / 전자레인지 / 태권도 걷기 / 벽치기)
- 메인 퀘스트 도중 **미니 퀘스트 무작위 인터럽트** (카톡 답장 타자 / 함정 투표 / 사진 고르기)
- 선배에게 발각 / HP 0 / 미니 퀘스트 실패 → **게임 오버**, 생존 일수를 온라인 리더보드에 등록
- 밸런스 수치는 전부 [src/config.ts](./src/config.ts)에 상수/함수로 모여 있음 (튜닝 지점)

## 로컬 개발

```bash
npm install

# 게임만 빠르게 개발 (리더보드 API 없음 — 클라이언트는 오프라인 폴백 동작)
npm run dev            # vite --host → 같은 Wi-Fi의 폰에서 접속 가능

# Functions + D1 포함 전체 테스트
npm run build
npm run d1:migrate:local   # 최초 1회: 로컬 D1에 스키마 적용
npm run pages:dev          # http://127.0.0.1:8788
```

## Cloudflare Pages 배포 (최초 설정)

1. **GitHub 연동**: Cloudflare 대시보드 → Workers & Pages → Create → Pages → 이 저장소 연결
   - 빌드 명령: `npm run build` / 출력 디렉터리: `dist` (`functions/`는 자동 인식)
2. **D1 생성 및 바인딩**:
   ```bash
   npx wrangler d1 create ygt2025-db
   ```
   출력된 `database_id`를 [wrangler.toml](./wrangler.toml)의 placeholder에 반영 후 커밋.
   (Pages 대시보드 → Settings → Bindings에서 `DB` 바인딩이 잡혔는지 확인)
3. **프로덕션 마이그레이션**:
   ```bash
   npm run d1:migrate:remote
   ```
4. **커스텀 도메인**: Pages 프로젝트 → Custom domains → `ygt2025.rokafa.app` 추가
   (rokafa.app이 같은 Cloudflare 계정에 있으면 DNS 레코드 자동 생성, HTTPS 자동)
5. 이후 `main` push마다 자동 배포. PR 브랜치는 프리뷰 URL 생성 (폰 테스트에 유용).

## 사용자 제공 에셋 (플레이스홀더 교체)

| 에셋 | 경로 | 현재 상태 |
|---|---|---|
| 「차는 두고 가」 음원 | `src/assets/audio/song.mp3` | WebAudio 칩튠 루프로 대체 중 — [src/core/AudioManager.ts](./src/core/AudioManager.ts)의 `startSong()`만 교체하면 됨 |
| 카카오톡 UI 캡처 | `src/assets/img/kakao/` | 메신저풍 목업으로 대체 중 — [src/scenes/mini/KakaoScene.ts](./src/scenes/mini/KakaoScene.ts) |

캐릭터/배경도 현재 도형+이모지 절차 생성이며, 텍스처 키 기반으로 교체 가능한 구조.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | Vite 개발 서버 (`--host`, 폰 접속 가능) |
| `npm run build` | strict TS 체크(클라이언트+Functions) + 프로덕션 빌드 + PWA 생성 |
| `npm run pages:dev` | 빌드 결과물 + Functions + 로컬 D1 서빙 |
| `npm run d1:migrate:local` | 로컬 D1 마이그레이션 |
| `npm run d1:migrate:remote` | 프로덕션 D1 마이그레이션 |
| `node scripts/gen-icons.mjs` | PWA 플레이스홀더 아이콘 재생성 |
