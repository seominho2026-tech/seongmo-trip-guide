/**
 * 파일을 휴대폰이면 공유 창(클래스룸·카톡·파일 앱으로 보내기), 컴퓨터면 내려받기로 준다.
 */
export async function giveFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (touch && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return 'cancelled'
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}

/** 파일 이름에 쓸 수 없는 글자를 뺀다 */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || '체험학습'
