import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { copyText } from '../../lib/clipboard'
import { tripUrl } from '../../lib/api'
import { giveFile, safeName } from '../../lib/download'
import { dateLabel, addDays } from '../../lib/time'
import type { TripDoc } from '../../trip/schema'

/** 링크·QR 나눠 주기. QR 은 이 기기에서 그린다(서버로 보내지 않는다). */
export function ShareSheet({ id, doc, onClose }: { id: string; doc: TripDoc; onClose: () => void }) {
  const url = tripUrl(id)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const msg = `[${doc.title}] 체험학습 안내예요. 일정·모이는 곳·준비물을 여기서 확인해요. 홈 화면에 추가해 두면 앱처럼 열려요.\n${url}`

  useEffect(() => {
    if (canvasRef.current) void QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1, color: { dark: '#111111', light: '#ffffff' }, errorCorrectionLevel: 'M' })
  }, [url])

  // QR 그림은 화면에 그린 캔버스에서 바로 꺼낸다(보안 정책상 data: 주소를 fetch 하지 않는다)
  const qrPng = async () => {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, url, { width: 1024, margin: 2, color: { dark: '#111111', light: '#ffffff' }, errorCorrectionLevel: 'M' })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob) await giveFile(blob, `${safeName(doc.title)}_QR.png`)
  }

  return (
    <Sheet title="학생·보호자에게 나눠 주기" onClose={onClose}>
      <div className="share">
        <div className="share__qr">
          <canvas ref={canvasRef} aria-label="안내 주소 QR 코드" role="img" />
        </div>
        <p className="share__url mono">{url}</p>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={async () => setCopied((await copyText(url)) ? 'url' : null)}>
            <Icon name="link" size="1.05rem" /> {copied === 'url' ? '복사했어요' : '링크 복사'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void qrPng()}>
            <Icon name="download" size="1.05rem" /> QR 그림 받기
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => window.open(`/t/${id}`, '_blank', 'noopener')}>
            <Icon name="eye" size="1.05rem" /> 학생 화면 보기
          </button>
        </div>
        <div className="share__msg">
          <span className="field__label">단체방에 보낼 글</span>
          <p className="share__msg-text">{msg}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={async () => setCopied((await copyText(msg)) ? 'msg' : null)}>
            <Icon name="copy" size="1rem" /> {copied === 'msg' ? '복사했어요' : '글 복사'}
          </button>
        </div>
        <p className="fineprint">
          {dateLabel(doc.startDate)}–{dateLabel(addDays(doc.startDate, doc.nights))} 여행. 링크·QR은 고쳐도 바뀌지 않아요. 고친 내용은 학생이 다시 열 때 바로 보여요.
        </p>
      </div>
    </Sheet>
  )
}
