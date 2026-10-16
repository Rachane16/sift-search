import { SearchError, searchWithEvidence } from "@/lib/search-engine";

export const dynamic = "force-dynamic";
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const githubOrigin = "https://rachane16.github.io";
const allowedOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin || origin === "https://sift-search-th.tealshell64.chatgpt.site" || origin === githubOrigin ? origin : null;
};
const headersFor = (origin: string | null) => origin === githubOrigin
  ? { ...jsonHeaders, "Access-Control-Allow-Origin": githubOrigin, "Vary": "Origin" }
  : jsonHeaders;

export async function OPTIONS(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", "Vary": "Origin" } });
}

export async function POST(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return Response.json({ error: "คำขอนี้ต้องมาจากหน้าเว็บ Sift" }, { status: 403, headers: jsonHeaders });
  const headers = headersFor(origin);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 415, headers });
  try {
    if (Number(request.headers.get("content-length")) > 12000) throw new SearchError("คำขอมีขนาดใหญ่เกินไป", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new SearchError("ไม่พบคำถาม", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 12000) { await reader.cancel(); throw new SearchError("คำขอมีขนาดใหญ่เกินไป", 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input: unknown; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new SearchError("ข้อมูลคำขอไม่ถูกต้อง", 400); }
    const result = await searchWithEvidence(input, { signal: request.signal });
    return Response.json(result, { headers });
  } catch (e) {
    return Response.json({ error: e instanceof SearchError ? e.message : "ยังค้นหาคำตอบไม่ได้ กรุณาลองใหม่" }, { status: e instanceof SearchError ? e.status : 500, headers });
  }
}


