import { useEffect, useRef, useState } from 'react'
import { Modal } from './ui'

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o?: { formats?: string[] }) => Detector } }

/** Lê código de barras pela câmera. Usa o leitor nativo do celular quando existe; senão, o ZXing (carregado só aqui). */
export default function LeitorCodigo({ onLido, onClose }: { onLido: (codigo: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let parar = false
    let stream: MediaStream | null = null
    let controleZxing: { stop: () => void } | null = null
    const lido = (c: string) => {
      if (parar) return
      parar = true
      try { navigator.vibrate?.(80) } catch { /* sem vibração */ }
      onLido(c.trim())
    }

    async function iniciar() {
      try {
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          if (!video.current) return
          video.current.srcObject = stream
          await video.current.play()
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
          const loop = async () => {
            if (parar || !video.current) return
            try {
              const r = await det.detect(video.current)
              if (r[0]?.rawValue) return lido(r[0].rawValue)
            } catch { /* quadro ainda não pronto */ }
            setTimeout(loop, 200)
          }
          loop()
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const leitor = new BrowserMultiFormatReader()
          if (!video.current) return
          controleZxing = await leitor.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (res) => {
            if (res) lido(res.getText())
          })
        }
      } catch (e) {
        const nome = (e as Error).name
        setErro(nome === 'NotAllowedError' ? 'Permita o uso da câmera para ler o código.' : 'Não foi possível abrir a câmera neste aparelho.')
      }
    }
    iniciar()
    return () => {
      parar = true
      controleZxing?.stop()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onLido])

  return (
    <Modal title="Ler código de barras" onClose={onClose}>
      {erro ? <p className="text-sm text-red-600">{erro}</p> : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_red]" />
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted">Aponte a câmera para o código. Ele é lido sozinho.</p>
    </Modal>
  )
}
