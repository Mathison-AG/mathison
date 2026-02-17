import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getClusterStats } from "@/lib/cluster/kubernetes";

// ─── GET /api/cluster/stats ───────────────────────────────
// Returns cluster-wide stats: nodes, capacity, allocated/used resources

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getClusterStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[GET /api/cluster/stats]", error);
    return NextResponse.json(
      { error: "Failed to fetch cluster stats" },
      { status: 500 }
    );
  }
}
