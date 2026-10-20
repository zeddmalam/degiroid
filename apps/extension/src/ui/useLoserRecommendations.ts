import { useCallback, useEffect, useMemo, useState } from "react";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import {
  fetchLoserRecommendations,
  type StockRecommendation,
} from "@/shared/api";

export function useLoserRecommendations(snapshot: DegiroSessionSnapshot) {
  const [recommendations, setRecommendations] = useState<
    StockRecommendation[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const [ai, setAi] = useState(false);
  const [requested, setRequested] = useState(false);

  const productIds = useMemo(
    () => (snapshot.indexLosers ?? []).map((row) => row.productId),
    [snapshot.indexLosers],
  );

  const loserKey = productIds.join("|");

  // Clear prior results when the loser set changes; do not auto-fetch.
  useEffect(() => {
    setRecommendations([]);
    setError(null);
    setAi(false);
    setRequested(false);
    setLoadingIds(new Set());
  }, [loserKey, snapshot.connected]);

  const requestRecommendation = useCallback(
    (productId: string) => {
      if (!snapshot.connected || !productId || loadingIds.has(productId)) {
        return;
      }

      setLoadingIds((prev) => new Set(prev).add(productId));
      setError(null);
      setRequested(true);
      void fetchLoserRecommendations({
        productIds: [productId],
        force: true,
      }).then((result) => {
        const incoming = result.recommendations.filter(
          (row) => row.productId === productId,
        );
        setRecommendations((prev) => [
          ...prev.filter((row) => row.productId !== productId),
          ...incoming,
        ]);
        setAi(result.ai);
        setError(
          result.error ??
            (incoming.length === 0
              ? "No recommendation returned for this stock."
              : null),
        );
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      });
    },
    [snapshot.connected, loadingIds],
  );

  const byProductId = useMemo(() => {
    const map = new Map<string, StockRecommendation>();
    for (const row of recommendations) map.set(row.productId, row);
    return map;
  }, [recommendations]);

  return {
    byProductId,
    loadingIds,
    error,
    ai,
    requested,
    canRequest: snapshot.connected && productIds.length > 0,
    requestRecommendation,
  };
}
