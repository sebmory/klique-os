import { POST as handleGenerate } from "@/app/api/content/generate/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
	return handleGenerate(request);
}
