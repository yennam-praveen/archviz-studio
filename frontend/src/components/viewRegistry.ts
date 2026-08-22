import * as THREE from 'three';

/**
 * Lets code outside the r3f Canvas (toolbar, render dialog) read the live viewport camera
 * so renders and exports use exactly the view the architect is looking at.
 */
export const viewRegistry: { camera: THREE.PerspectiveCamera | null; aspect: number } = { camera: null, aspect: 16 / 9 };

if (import.meta.env.DEV) (window as unknown as { __viewRegistry: unknown }).__viewRegistry = viewRegistry;
