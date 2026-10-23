import { useEffect, useState } from 'react';
import { decodeBlp } from '@core/client/blp';
import { assetUrl } from '@core/client/asset-url';

/** Icons already read from the client, by client path; a path that could not be read is kept as null */
const pictures = new Map<string, Promise<string | null>>();

async function picture(path: string): Promise<string | null> {
  try {
    const response = await fetch(assetUrl(path));
    if (!response.ok) return null;
    const image = decodeBlp(new Uint8Array(await response.arrayBuffer()));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * A spell icon read from the game client (`Interface\Icons\<name>.blp`). Without a client, or for an icon the client
 * lacks, a plain square with the first letters of its name stands in, so lists keep their shape.
 */
export function SpellIconImage({ path, name, size = 32 }: { path: string | null; name?: string; size?: number }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(null);
    if (!path) return undefined;
    let live = true;
    if (!pictures.has(path)) pictures.set(path, picture(path));
    void pictures.get(path)!.then((s) => {
      if (live) setSrc(s);
    });
    return () => {
      live = false;
    };
  }, [path]);
  const style = { width: size, height: size };
  if (src) return <img className="spell-icon" src={src} alt="" style={style} />;
  return <span className="spell-icon spell-icon--none" aria-hidden="true" style={style}>{(name ?? '').replace(/^.*_/, '').slice(0, 2)}</span>;
}
