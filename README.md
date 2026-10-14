# 📒 메이플랜드 성장 기록

레벨 · 경험치 · 메소를 가끔 적어 두면 며칠, 몇 주 단위의 성장 추세를 보여 주는 웹앱입니다.
**<https://mapleland.myungwoo.kr/log/>**

- **30초 입력** — 직전 기록으로 미리 채워 바뀐 칸만 고칩니다. 경험치는 값이나 퍼센트로,
  메소는 `1억 2500만` · `3천만` 처럼 적어도 됩니다.
- **성장 곡선** — 레벨업마다 끊기지 않게 누적 경험치로 그리고, 레벨 경계를 가로줄로 보여 줍니다.
- **날짜별 경험치 · 메소 증감** — 7일 평균과 함께. 기록 사이에 오른 양은 날짜별로 고르게 나눈
  추정치로 표시합니다.
- **목표 도달 예상** — 다음 레벨 · 목표 레벨 · 목표 메소에 닿는 날짜를 최근 7일 · 30일 페이스로.
- **레벨 변화 추이** — 레벨마다 걸린 기간과 앞으로의 레벨별 도달 예상일.
- **캐릭터 여러 개**, 지난 기록 소급 입력, JSON 백업 / 불러오기, CSV 내보내기.

기록은 이 브라우저(localStorage)에만 저장되고 어디로도 보내지 않습니다. 브라우저 데이터를 지우면
함께 사라지니 가끔 JSON 백업을 받아 두세요.

## 개발

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 로직 테스트 (Asia/Seoul 기준)
npm run typecheck && npm run lint && npm run build
```

정적 내보내기(`out/`)로 GitHub Pages 에 배포합니다. 하위 경로는 `NEXT_PUBLIC_BASE_PATH` 로 받습니다.
`main` 에 푸시하면 배포되고, 끝나면 [mapleland-utils](https://github.com/myungwoo/mapleland-utils) 에
재빌드를 알립니다(`MAPLELAND_UTILS_DISPATCH` 시크릿).

경험치 표는 [경험치 측정기](https://github.com/myungwoo/mapleland-exp-tracker-web)의 표를 씁니다.

## 라이선스

MIT. 이 도구는 넥슨과 관계가 없습니다.
