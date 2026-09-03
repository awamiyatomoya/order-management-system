import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextUrl = new URL("/set-password", requestUrl.origin);

  requestUrl.searchParams.forEach((value, key) => {
    nextUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(nextUrl);
}
