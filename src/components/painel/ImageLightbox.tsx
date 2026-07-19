import { useEffect } from 'react';

/**
 * Ampliação de uma imagem (URL http/https ou Blob URL temporário de um
 * documento base64 decodificado) — nunca recebe Base64 cru como `src`.
 */
export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="image-lightbox-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="Fechar imagem ampliada">
        ×
      </button>
      <img src={src} alt="" className="image-lightbox-img" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
