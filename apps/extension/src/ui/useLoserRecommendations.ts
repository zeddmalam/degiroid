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
  const [loading, setLoading] = useState(false);
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
    setLoading(false);
  }, [loserKey, snapshot.connected]);

  const requestRecommendations = useCallback(() => {
    if (!snapshot.connected || productIds.length === 0 || loading) return;

    setLoading(true);
    setError(null);
    setRequested(true);
    void fetchLoserRecommendations({
      productIds,
      force: true,
    }).then((result) => {
      setRecommendations(result.recommendations);
      setAi(result.ai);
      setError(result.error ?? null);
      setLoading(false);
    });
  }, [snapshot.connected, productIds, loading]);

  const byProductId = useMemo(() => {
    const map = new Map<string, StockRecommendation>();
    for (const row of recommendations) map.set(row.productId, row);
    return map;
  }, [recommendations]);

  return {
    byProductId,
    loading,
    error,
    ai,
    requested,
    canRequest: snapshot.connected && productIds.length > 0 && !loading,
    requestRecommendations,
  };
}
