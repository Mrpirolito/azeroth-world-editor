import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ASSET_BASE_URL } from '@core/client/asset-url';
import { sharedManagers } from './world3d';
import { useShowInWorld } from './ShowInWorldContext';
import ModelManager from './scene/model/ModelManager';
import DisplayResolver from './scene/spawn/DisplayResolver';
import type { Look } from './scene/spawn/DisplayResolver';
import { attach, canHold } from './scene/spawn/wear';
import { DISPLAY_RECORDS } from './scene/db/records';

type Gait = 'stand' | 'walk' | 'run';
type Status = 'loading' | 'ready' | 'none' | 'error';

type ModelPreviewProps = {
  kind: 'creature' | 'object' | 'item';
  /** A creature or object display, or an item's display (ItemDisplayInfo) */
  displayId: number;
  /** A creature's weapons, as item ids: main hand, off hand */
  equipment?: readonly number[];
  scale?: number;
  /** Where an item is worn: only weapons and shields have a model of their own */
  inventoryType?: number;
};

const HEIGHT = 260;
/** Hand-held inventory types: one-hand, shield, ranged, two-hand, main hand, off hand, held, thrown, ranged right */
const HELD_TYPES = new Set([13, 14, 15, 17, 21, 22, 23, 25, 26]);
const GAITS: readonly Gait[] = ['stand', 'walk', 'run'];
const MAX_PITCH = 1.4;

/** What every preview draws with: one model manager and resolver on the shared textures and tables (made on the first preview) */
let stack: { models: ModelManager; resolver: DisplayResolver } | null = null;
const stackOf = () => {
  if (!stack) {
    const { textures, databases } = sharedManagers();
    stack = {
      models: new ModelManager({ host: { baseUrl: ASSET_BASE_URL, normalizePath: true }, textureManager: textures }),
      resolver: new DisplayResolver({ get: (name) => databases.get(`${name}.dbc`, DISPLAY_RECORDS[name as keyof typeof DISPLAY_RECORDS] as any) }),
    };
  }
  return stack;
};

/** Frees what a preview's model holds of its own (animations, materials); the shared geometry and textures stay with the manager */
const release = (root: THREE.Object3D) => {
  root.traverse((object) => {
    const drawn = object as THREE.Object3D & { dispose?(): void; material?: THREE.Material | THREE.Material[] };
    if (object === root && !drawn.dispose) return;
    drawn.dispose?.();
    for (const material of Array.isArray(drawn.material) ? drawn.material : drawn.material ? [drawn.material] : []) material.dispose();
  });
};

/** The model for a display, dressed and armed; null when the client has no model for it */
async function build(props: ModelPreviewProps): Promise<THREE.Object3D | null> {
  const { models, resolver } = stackOf();
  const { kind, displayId, equipment = [], scale, inventoryType = 0 } = props;
  const look: Look | null = kind === 'creature' ? await resolver.creature(displayId)
    : kind === 'object' ? await resolver.object(displayId)
    : HELD_TYPES.has(inventoryType) ? await resolver.itemDisplay(displayId, inventoryType) : null;
  if (!look || look.kind === 'building') return null;
  const built = { ...look };
  if (built.body) {
    const texture = await sharedManagers().characterTexture.build(built.body);
    if (texture) built.textures = { ...built.textures, 1: texture };
  }
  const model = await models.get(built.path, built);
  if (canHold(model)) {
    await Promise.all([
      ...(built.attachments ?? []).map((worn) => attach(model, worn.point, worn.look, (l) => models.get(l.path, l)).catch(() => {})),
      ...([[equipment[0], 1], [equipment[1], 2]] as const).map(async ([item, point]) => {
        const weapon = item && item > 0 ? await resolver.weapon(item) : null;
        if (weapon) await attach(model, point, weapon, (l) => models.get(l.path, l)).catch(() => {});
      }),
    ]);
  }
  if (kind === 'creature') model.scale.setScalar(built.scale * (scale && scale > 0 ? scale : 1));
  return model;
}

/**
 * A rotating, zoomable 3D preview of a creature, object or item model, from the client's own files. It
 * needs the game client (the same one the World draws from) and says so when there is none.
 */
export function ModelPreview(props: ModelPreviewProps): React.JSX.Element {
  const { kind, displayId, scale, inventoryType = 0 } = props;
  const hasClient = useShowInWorld() !== null;
  const hasModel = kind !== 'item' || HELD_TYPES.has(inventoryType);
  const shown = hasClient && displayId > 0 && hasModel;
  const holder = useRef<HTMLDivElement>(null);
  const stage = useRef<{ show(model: THREE.Object3D | null): void; setGait(gait: Gait): void } | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [gait, setGait] = useState<Gait>('stand');
  const equipmentKey = (props.equipment ?? []).slice(0, 2).join(',');

  // The stage: a renderer, camera and frame loop that live while there is something to show
  useEffect(() => {
    const parent = holder.current;
    if (!shown || !parent) return undefined;
    // A canvas of its own each time: a lost context stays with its canvas, and StrictMode mounts twice
    const element = document.createElement('canvas');
    element.setAttribute('aria-label', 'Model preview');
    Object.assign(element.style, { width: '100%', height: `${HEIGHT}px`, display: 'block', touchAction: 'none', cursor: 'grab' });
    parent.appendChild(element);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: element, antialias: true });
    } catch {
      element.remove();
      setStatus('error');
      return undefined;
    }
    renderer.setPixelRatio(window.devicePixelRatio);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    // The client's world is Z-up
    camera.up.set(0, 0, 1);
    const view = { yaw: 0.6, pitch: 0.25, distance: 5, radius: 1, center: new THREE.Vector3() };
    let current: THREE.Object3D | null = null;
    let gaitNow: Gait = 'stand';
    const setCurrentGait = () => (current as (THREE.Object3D & { animation?: { setGait(g: Gait): void } }) | null)?.animation?.setGait(gaitNow);

    stage.current = {
      setGait: (next) => {
        gaitNow = next;
        setCurrentGait();
      },
      show: (model) => {
        if (current) {
          scene.remove(current);
          release(current);
        }
        current = model;
        if (!model) return;
        scene.add(model);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 2));
        box.getCenter(view.center);
        view.radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.1);
        view.distance = view.radius * 2.4;
        setCurrentGait();
      },
    };

    const resize = () => {
      const width = element.clientWidth || 260;
      renderer.setSize(width, HEIGHT, false);
      camera.aspect = width / HEIGHT;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    let visible = true;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
    });
    intersection.observe(element);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!visible || document.hidden) return;
      camera.near = view.radius / 50;
      camera.far = view.distance + view.radius * 50;
      camera.updateProjectionMatrix();
      const flat = Math.cos(view.pitch) * view.distance;
      camera.position.set(view.center.x + flat * Math.cos(view.yaw), view.center.y + flat * Math.sin(view.yaw), view.center.z + Math.sin(view.pitch) * view.distance);
      camera.lookAt(view.center);
      camera.updateMatrixWorld();
      stackOf().models.update(delta, camera);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    let drag: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY };
      element.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      view.yaw -= (event.clientX - drag.x) * 0.01;
      view.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, view.pitch + (event.clientY - drag.y) * 0.01));
      drag = { x: event.clientX, y: event.clientY };
    };
    const up = () => {
      drag = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      view.distance = Math.max(view.radius * 0.5, Math.min(view.radius * 10, view.distance * Math.exp(event.deltaY * 0.001)));
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
      stage.current?.show(null);
      stage.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      element.remove();
    };
  }, [shown]);

  // The model: loaded again for each change of display, the answer of an earlier one dropped
  useEffect(() => {
    if (!shown) return undefined;
    let live = true;
    setStatus('loading');
    build(props).then(
      (model) => {
        if (!live || !stage.current) {
          if (model) release(model);
          return;
        }
        stage.current.show(model);
        setStatus(model ? 'ready' : 'none');
      },
      (error) => {
        console.warn(`3D preview: display ${displayId} could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
        if (live) setStatus('error');
      },
    );
    return () => {
      live = false;
    };
    // `props` is read for what the keys below name
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, kind, displayId, scale, inventoryType, equipmentKey]);

  if (!hasClient) return <p className="scene-hint">Set the game client folder in Settings to see models.</p>;
  if (!hasModel) return <p className="scene-hint">This item has no standalone model.</p>;
  if (!(displayId > 0)) return <p className="scene-hint">No display chosen.</p>;
  const note = status === 'loading' ? 'Loading model…'
    : status === 'none' ? `The client has no model for display ${displayId}.`
    : status === 'error' ? 'The model could not be drawn.' : null;
  return (
    <div className="scene-section">
      <div ref={holder} style={{ minHeight: HEIGHT }} />
      {note && <p className="scene-hint">{note}</p>}
      {kind === 'creature' && status === 'ready' && (
        <div>
          {GAITS.map((g) => (
            <button key={g} type="button" className="entry-card__btn" aria-pressed={gait === g} onClick={() => { setGait(g); stage.current?.setGait(g); }}>
              {g[0]!.toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
