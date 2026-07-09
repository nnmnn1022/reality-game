export default function Page() {
  return (
    <main className="status-page">
      <div className="status-shell">
        <p className="eyebrow">Reality Mission Engine</p>
        <h1>디스코드 게임 백엔드가 동작 중입니다.</h1>
        <p>
          플레이는 디스코드 인터랙션으로 진행됩니다. 루트 페이지는 상태 확인용이며, 게임 조작은
          `/api/discord/interactions` 엔드포인트가 처리합니다.
        </p>
      </div>
    </main>
  );
}
