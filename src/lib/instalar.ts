import { useEffect, useState } from 'react'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let guardado: PromptEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); guardado = e as PromptEvent })

const instalado = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Botão "Instalar app": Android/Chrome usa o prompt nativo; iPhone recebe instruções. */
export function useInstalar() {
  const [podePrompt, setPodePrompt] = useState(!!guardado)
  const [jaInstalado, setJaInstalado] = useState(instalado())

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); guardado = e as PromptEvent; setPodePrompt(true) }
    const done = () => { setJaInstalado(true); guardado = null; setPodePrompt(false) }
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done) }
  }, [])

  async function instalar() {
    if (!guardado) return false
    await guardado.prompt()
    await guardado.userChoice
    guardado = null; setPodePrompt(false)
    return true
  }

  return { disponivel: !jaInstalado && (podePrompt || ios()), ios: ios() && !podePrompt, instalar }
}
