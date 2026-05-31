// scene.ts — Mock SceneDescriptor for dev/test mode (ADR-047).
// Represents a clear daytime scene with no precipitation overlay.

import type { SceneDescriptor } from '../api/types';

export const mockScene: SceneDescriptor = {
  sky: 'clear',
  daytime: true,
  overlay: null,
};
