import { NextRequest, NextResponse } from "next/server";
import { items, place, tourFetch, withDetailImage } from "../../../../lib/tour-api";

export async function GET(request: NextRequest) {
  try {
    const mapX = request.nextUrl.searchParams.get("mapX") || "";
    const mapY = request.nextUrl.searchParams.get("mapY") || "";
    const body = await tourFetch("locationBasedList2", {
      mapX,
      mapY,
      radius: "10000",
      numOfRows: "20",
      pageNo: "1",
      arrange: "E",
    });
    const resolved = await Promise.all(items(body).map(place).map(withDetailImage));
    return NextResponse.json({ items: resolved });
  } catch {
    return NextResponse.json(
      { items: [], message: "주변 관광지를 불러오지 못했어요." },
      { status: 503 },
    );
  }
}
