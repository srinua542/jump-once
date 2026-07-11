/**
 * QualityTier — the REQ-016 × REQ-163 interlock itself (S9.10): `applyTier`
 * may drop only `critical: false` `DrawItem`s (`render/scene/DrawList.ts`'s
 * own contract, pinned there since S9.3/S9.4). Order-preserving and
 * deterministic: the same `DrawList` + tier always survives the identical
 * subset of non-critical items.
 */

import type { DrawItem, DrawList } from '../scene/DrawList';
import type { QualityTierRule } from './QualityProfile';

/** Keep every critical item; keep only the first `tier.nonCriticalBudget` non-critical items (unlimited when `null`). */
export function applyTier(drawList: DrawList, tier: QualityTierRule): DrawList {
  if (tier.nonCriticalBudget === null) return drawList;
  const budget = tier.nonCriticalBudget;
  const out: DrawItem[] = [];
  let nonCriticalKept = 0;
  for (const item of drawList) {
    if (item.critical) {
      out.push(item);
      continue;
    }
    if (nonCriticalKept < budget) {
      out.push(item);
      nonCriticalKept++;
    }
  }
  return out;
}
