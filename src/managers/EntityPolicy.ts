import * as THREE from 'three';
import type { EntityParticipation } from '../types/SceneTypes';

export type EntityParticipationKey = keyof Required<EntityParticipation>;

export function allowsEntityParticipation(object: THREE.Object3D, key: EntityParticipationKey): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    const participation = current.userData.entityParticipation as EntityParticipation | undefined;
    if (participation) return participation[key] ?? true;
    current = current.parent;
  }
  return true;
}
