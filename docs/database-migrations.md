# 데이터베이스 마이그레이션 관리

## 적용 방법

Supabase SQL Editor에 수동으로 SQL을 복붙하지 않습니다. `supabase/migrations/` 폴더의
파일을 파일명(타임스탬프) 순서대로 실행하며, 아래 명령으로 한 번에 적용합니다.

```
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push
```

`db push`는 아직 적용되지 않은 마이그레이션 파일만 순서대로 적용하고, 각 파일은 하나의
트랜잭션으로 실행되어 중간에 오류가 나면 그 파일 전체가 자동으로 롤백됩니다.

## 현재 적용된 마이그레이션 (Gate 1 기준)

| 파일 | 내용 |
|---|---|
| `20260716000001_extensions_and_helpers.sql` | pg_trgm 확장, 공통 트리거 함수 |
| `20260716000002_profiles.sql` | 사용자/권한, 로그인 시 프로필 자동생성, 권한 헬퍼 함수 |
| `20260716000003_dispositions.sql` | 행정처분 (개인정보 최소화, 공개기한 관리 포함) |
| `20260716000004_recalls.sql` | 회수·판매중지 |
| `20260716000005_regulations.sql` | 법령·고시·입법예고 |
| `20260716000006_boards_and_actions.sql` | 보드, 조치관리, 증빙파일, 상태 자동동기화 |
| `20260716000007_tags.sql` | 태그 룰, 태그 연결, 삭제 시 orphan 정리 |
| `20260716000008_collection_runs_and_partners.sql` | 수집 이력, 협력사 마스터(Phase 3 대비) |
| `20260716000009_rls_policies.sql` | 전체 테이블 접근권한(RLS) 정책 |
| `20260716000010_security_hardening.sql` | 자동 보안진단 결과 반영(함수 search_path 고정) |
| `20260716000011_gate2_security_hardening.sql` | pg_trgm을 extensions 스키마로 이동, 헬퍼 함수 anon/authenticated RPC 권한 회수 시도 |
| `20260716000012_gate2_security_hardening_fix.sql` | PUBLIC 의사 롤에 남아있던 EXECUTE 권한 회수 보정(§Gate 2 실행 결과 참고) |

## 롤백 방법

Supabase CLI는 "되돌리기" 명령을 제공하지 않으므로, 되돌려야 할 경우 반대 작업을 하는
새 마이그레이션 파일을 추가로 작성해 적용합니다 (예: 테이블 삭제가 필요하면
`DROP TABLE` 문을 담은 새 마이그레이션을 추가). 기존 마이그레이션 파일은 이미 적용된
이력이므로 수정하지 않고, 항상 새 파일을 더하는 방식으로 관리합니다.

## 실행한 테스트 (Gate 1)

1. **스키마 검증**: `dispositions` 테이블에 대표자명·전화번호·상세주소·전체 인허가번호
   컬럼이 없고, `public_until`/`visibility_status` 컬럼이 있는지 확인 — 통과
2. **RLS 활성화 확인**: 12개 테이블 전체 `relrowsecurity = true` 확인 — 통과
3. **Supabase 자동 보안진단(db advisors)**: 12건 발견 → search_path 미고정 4건 즉시 수정,
   나머지 8건(pg_trgm 스키마 위치, 내부 헬퍼 함수의 RPC 직접 노출)은 낮은 심각도(WARN)로
   Gate 2에서 실제 로그인 계정으로 접근 테스트 후 마무리 예정
4. **기능 테스트** (임시 테스트 계정으로 실행 후 전부 삭제):
   - 동일 `source_key` 중복 삽입 차단 확인
   - 조치(actions) 등록/완료 시 콘텐츠 테이블의 `action_status` 자동 동기화 확인
   - 콘텐츠 삭제 시 `item_tags` orphan 자동 정리 확인

## 실행한 테스트 (Gate 2)

1. **db advisors 재확인**: pg_trgm의 `extension_in_public` 경고 해소 확인 (schema를
   `extensions`로 이동, 기존 trigram 인덱스는 OID 참조라 영향 없음).
2. **헬퍼 함수 RPC 노출 축소**: `handle_new_auth_user`(트리거 전용)는 anon/authenticated
   양쪽 모두 EXECUTE 회수. `is_active_admin`/`is_active_user`/`is_active_editor_or_admin`은
   RLS 정책 평가에 `authenticated` 실행 권한이 필요하므로 유지하고, `anon`만 회수.
   최초 REVOKE는 PostgreSQL이 함수 생성 시 기본 부여하는 PUBLIC 의사 롤 권한 때문에
   무력화되어(`REVOKE ... FROM anon`만으로는 부족) 20260716000012에서 `FROM public` 회수로
   보정. 재확인 결과 9건 → 3건(모두 `authenticated`의 정상적인 필요 권한)으로 감소, 이는
   설계상 의도된 잔여 WARN.
3. **관리자 화면(검수대상 건수)**: `/admin/quarantine` 페이지로 구현 (아래 §admin 참고).
