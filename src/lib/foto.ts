import { supabase } from './supabase'

/** Reduz a foto no próprio celular (máx. 900px, JPEG) antes de enviar: carrega rápido e ocupa pouco espaço. */
async function comprimir(arquivo: File): Promise<Blob> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url
    })
    const escala = Math.min(1, 900 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.82))
  } finally { URL.revokeObjectURL(url) }
}

export async function enviarFotoProduto(storeId: string, productId: string, arquivo: File): Promise<string> {
  const blob = await comprimir(arquivo)
  const caminho = `${storeId}/${productId}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('produtos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  const url = supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
  const { error: e2 } = await supabase.from('products').update({ image_url: url }).eq('id', productId)
  if (e2) throw e2
  return url
}
