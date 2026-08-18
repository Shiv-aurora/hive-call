export function GET() { return Response.json({ status: "ok", service: "hive", mode: process.env.REASONING_PROVIDER ?? "mock" }); }
