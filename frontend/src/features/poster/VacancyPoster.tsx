import { useEffect, useRef, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { useSession } from '../session/context'
import { errorText } from '../vacancies/model'
import './poster.css'

export function VacancyPoster({ id }: { id: number }) {
  const { vacancies, mode } = useSession()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  async function load() {
    if (pending.current || !vacancies.poster) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    try {
      const blob = await vacancies.poster(id, controller.signal)
      if (!controller.signal.aborted) setUrl(URL.createObjectURL(blob))
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      pending.current = null
    }
  }
  function print() {
    const view = window.open('', '_blank', 'popup,width=850,height=1000')
    if (!view) {
      setError('Браузер не открыл печать. Разрешите всплывающее окно или скачайте объявление.')
      return
    }
    view.opener = null
    view.document.title = 'Объявление — Сезон'
    const style = view.document.createElement('style')
    style.textContent =
      '@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;object-fit:contain}'
    const img = view.document.createElement('img')
    img.alt = 'Объявление с QR-кодом для отклика'
    img.onload = () => {
      view.focus()
      view.print()
    }
    img.src = url
    view.document.head.append(style)
    view.document.body.append(img)
  }
  return (
    <section className="poster-panel">
      <h3>Объявление для печати</h3>
      <p>Лист A4 с условиями и QR-кодом для отклика. Разместите его на доске объявлений.</p>
      {mode === 'preview' ? (
        <p>Настоящий QR-код доступен для опубликованной вакансии после входа через MAX.</p>
      ) : (
        <>
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            {busy
              ? 'Готовим объявление…'
              : url
                ? 'Получить актуальное объявление'
                : 'Распечатать объявление'}
          </Button>
          {url && (
            <>
              <img className="poster-preview" src={url} alt="Объявление A4 с QR-кодом вакансии" />
              <div className="vacancy-actions">
                <Button onClick={print}>Печать A4</Button>
                <a className="text-link" href={url} download={`season-vacancy-${id}.svg`}>
                  Скачать SVG
                </a>
              </div>
              <p>На телефоне можно скачать лист и распечатать его с компьютера.</p>
            </>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
