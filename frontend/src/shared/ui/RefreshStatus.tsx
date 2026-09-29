export function RefreshStatus({
  refreshing,
  failed,
  retry,
}: {
  refreshing: boolean
  failed: boolean
  retry: () => void
}) {
  return (
    <div className="return-refresh-status" role="status" aria-live="polite">
      {refreshing ? (
        'Обновляем данные…'
      ) : failed ? (
        <>
          Не удалось обновить. Показаны ранее загруженные данные.{' '}
          <button type="button" onClick={retry}>
            Повторить обновление
          </button>
        </>
      ) : null}
    </div>
  )
}
