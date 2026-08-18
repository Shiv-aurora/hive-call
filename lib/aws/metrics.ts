export function emitHiveMetrics(metrics: Record<string, number>, dimensions: Record<string, string> = {}) {
  const namespace = "HiveCall";
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{ Namespace: namespace, Dimensions: [Object.keys(dimensions)], Metrics: Object.keys(metrics).map((Name) => ({ Name, Unit: Name.includes("Latency") ? "Milliseconds" : "Count" })) }],
    },
    ...dimensions,
    ...metrics,
  }));
}
