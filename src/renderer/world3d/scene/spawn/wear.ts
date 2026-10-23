import type * as THREE from 'three';
import type { ModelLook } from './DisplayResolver.js';

/** M2 attachment point of a shield: on the arm, whichever hand holds it */
const SHIELD_POINT = 0;

/** A drawn model that has attachment points, so it can hold weapons and wear helmets */
type Holder = THREE.Object3D & { attachmentObject(point: number): THREE.Object3D | null };
const canHold = (object: THREE.Object3D | null): object is Holder => typeof (object as Holder | null)?.attachmentObject === 'function';

/** A model drawn on one of a holder's attachment points (a shield on the arm's, whichever point is asked); none there leaves it off */
const attach = async (model: Holder, point: number, look: ModelLook, createModel: (look: ModelLook) => Promise<THREE.Object3D>) => {
  const at = model.attachmentObject(look.shield ? SHIELD_POINT : point);
  if (at) at.add(await createModel(look));
};

export { attach, canHold };
export type { Holder };
