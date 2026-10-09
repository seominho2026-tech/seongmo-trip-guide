# 대전성모여고 체험학습 가이드

## 프로젝트 식별
- GitHub: https://github.com/seominho2026-tech/seongmo-trip-guide
- 원작: https://github.com/shinnanchanguk/trip-guide (MIT, 저작권·라이선스 유지)
- Vercel projectId: prj_fSpUzux7YCcMOYhVVlPg0duYvilZ
- Vercel orgId: team_jWOKc9uPTAoRFeZxYePdneO3
- Vercel team: smh-s-projects
- Vercel project: seongmo-trip-guide
- 공개 주소: https://seongmo-trip-guide.vercel.app
- Blob store: store_GhfSlwQNtbR4cbaD (private, icn1)
- Supabase: 사용하지 않음

## 작업 규칙
- 결과는 완료 / 진행중 / 다음 할 일 / 리스크·확인 필요 체크리스트로 쉽게 보고한다.
- 학교 이름 중심으로 원본 기능과 화면 흐름을 유지한다. 샘플은 실제 행사와 구분한다.
- 소감 파일의 DORMSTRIP1 데이터 형식과 구형 파일 읽기를 유지한다.
- 학생 이름·학번·소감은 브라우저와 사용자가 내려받은 파일에서만 처리한다.
- 인증값, .env*, .vercel/, .data/, .artifacts/, 학생 자료를 Git에 추가하지 않는다.
- 실제 안내·접근 제어를 삭제하거나 약화하기 전에 복원 자료와 사용자 승인을 확보한다.
- 배포 전 .vercel/project.json을 위 프로젝트·팀과 대조한다. 다른 프로젝트는 수정하지 않는다.
- npm test 및 npm run build로 검사하고 의도한 변경만 commit·push한다.
- 배포 후 Ready, 공개 주소 HTTP 200, 핵심 화면, 콘솔·서버 로그와 저장 지속성을 확인한다.
- 도름스체크 v0.3.1을 npx로 detect/init/scan 실행한다. 전역 훅·차단 기능은 설치하지 않는다.
