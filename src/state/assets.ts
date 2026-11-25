import type { ID } from '../types';

/**
 * Raster assets live outside the serializable project history snapshots.
 * Each replacement gets a fresh asset id, so undo can point back to the old
 * canvas without retaining a data URL in every history entry.
 */
class AssetRegistry {
  private assets = new Map<ID, HTMLCanvasElement | HTMLImageElement>();

  set(assetId: ID, source: HTMLCanvasElement | HTMLImageElement): void {
    this.assets.set(assetId, source);
  }

  get(assetId?: ID): HTMLCanvasElement | HTMLImageElement | undefined {
    return assetId ? this.assets.get(assetId) : undefined;
  }

  has(assetId?: ID): boolean {
    return Boolean(assetId && this.assets.has(assetId));
  }
}

export const assetRegistry = new AssetRegistry();
