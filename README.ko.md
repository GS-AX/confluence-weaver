# Confluence Weaver

Confluence 페이지를 Obsidian Vault에 Markdown 파일로 동기화합니다.

**Confluence Cloud** (Basic 인증)와 **Confluence Data Center / Server** (Bearer 토큰) 모두 지원합니다.

English README: [README.md](README.md)

---

## 주요 기능

- **CQL 프로파일** — Confluence Query Language 쿼리를 여러 개 정의하고, 각각 다른 Vault 폴더로 저장
- **증분 동기화** — 버전이 변경된 페이지만 업데이트, 변경 없는 페이지는 건너뜀
- **Storage Format → Markdown** — 제목, 단락, 표, 코드블록, 태스크 리스트, 알림 패널 등 변환
- **Frontmatter** — 모든 페이지에 `confluence_id`, `confluence_url`, `title`, `space`, `author`, `created`, `updated`, `version`, `labels` 자동 삽입
- **사용자 노트 보호** — 섹션 마커 아래에 작성한 내용은 재동기화 시에도 보존
- **Wiki-link 변환** — Confluence 내부 링크를 Obsidian `[[wiki-link]]` 형식으로 변환 (옵션)
- **폴더 계층 구조** — Confluence 상위 페이지를 폴더로 반영 (옵션)
- **커스텀 필드 매핑** — dot-path로 Confluence 페이지 JSON의 임의 필드를 frontmatter 키로 매핑
- **Jira Weaver 연동** — Jira Weaver 파일 내 Confluence URL을 `[[wiki-link]]`로 자동 교체
- **싱크 로그 패널** — 프로파일별 생성 / 업데이트 / 건너뜀 / 오류 카운트
- **자동 싱크** — 시작 시 실행 및 N분 간격 반복 싱크 (1–1440분)

---

## 설치

Obsidian *설정 → 커뮤니티 플러그인 → 탐색* 에서 **Confluence Weaver** 검색 후 설치.

---

## 초기 설정

1. *설정 → Confluence Weaver* 열기
2. **Confluence 도메인** 입력 (예: `https://mycompany.atlassian.net/wiki`)
3. **인증 방식** 선택:
   - *Basic auth (Cloud)* — 이메일 + [API 토큰](https://id.atlassian.com/manage-profile/security/api-tokens) 입력
   - *Bearer token (DC/Server)* — Personal Access Token 입력
4. **연결 테스트** 클릭 — 우상단에 성공 알림 확인
5. **CQL 프로파일** 추가 — 쿼리, 대상 폴더, 최대 페이지 수 설정
6. 커맨드 팔레트에서 **페이지 싱크** 실행

---

## CQL 쿼리 예시

```
space = "DEV" AND ancestor = "Architecture" ORDER BY lastmodified DESC
space = "TEAM" AND label = "weekly-report"
type = "page" AND creator = currentUser() AND lastModified >= startOfMonth()
```

자주 쓰는 필드:

| 필드 | 의미 |
|---|---|
| `space` | 스페이스 키 |
| `label` | 레이블 |
| `ancestor` | 상위 페이지 제목 |
| `creator` | 작성자 |
| `lastModified` | 마지막 수정일 |
| `type` | `page` / `blogpost` |

---

## 섹션 마커

동기화된 파일은 아래 마커로 끝납니다:

```
[confluence-weaver section end]
```

이 마커 **아래에 작성한 내용은 재동기화 시에도 삭제되지 않습니다.** 개인 메모, 백링크, 태그 등을 자유롭게 작성하세요.

---

## 커스텀 필드 매핑

*설정 → 고급 → 사용자 정의 필드 매핑* 에서 줄당 하나씩 입력:

```
space.key → project
version.number → revision
history.createdBy.displayName → confluence_author
```

결과 frontmatter 예시:

```yaml
project: DEV
revision: 5
confluence_author: Alice
```

---

## Jira Weaver 연동

[Jira Weaver](https://github.com/GS-AX/jira-weaver)도 함께 사용 중이라면, 페이지 싱크 후 커맨드 팔레트에서 **Jira 노트에 Confluence 페이지 연결** 을 실행하세요.

`jira_id` frontmatter를 가진 파일 내 Confluence URL을 자동으로 `[[wiki-link]]`로 교체합니다.

---

## Frontmatter 전체 예시

```yaml
---
confluence_id: "123456"
confluence_url: "https://mycompany.atlassian.net/wiki/spaces/DEV/pages/123456"
title: "아키텍처 개요"
space: "DEV"
space_name: "Development"
author: "홍길동"
created: "2025-01-15"
updated: "2025-04-01"
version: 3
labels:
  - architecture
  - backend
parent: "[[123400_엔지니어링-허브]]"
---
```

---

## 커맨드 목록

| 커맨드 | 설명 |
|---|---|
| 페이지 싱크 | 활성화된 모든 프로파일 증분 동기화 |
| 페이지 강제 싱크 (전체 덮어쓰기) | 모든 페이지 재다운로드 후 덮어쓰기 |
| 싱크 로그 열기 | 동기화 통계 패널 열기 |
| Jira 노트에 Confluence 페이지 연결 | Jira Weaver 파일의 Confluence URL을 wiki-link로 변환 |

---

## 라이선스

MIT
