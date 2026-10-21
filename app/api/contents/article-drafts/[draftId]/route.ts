import { isArticleCreationDraftsEnabled } from "@/lib/article-creation-drafts/activation";
import {
  articleCreationDraftErrorResponse,
  articleCreationDraftsDisabledResponse,
  privateJson,
} from "@/lib/article-creation-drafts/http";
import { ArticleCreationDraftRepository } from "@/lib/article-creation-drafts/repository";
import { validateUpdateArticleCreationDraftBody } from "@/lib/article-creation-drafts/validation";
import { requireContentAccess } from "@/lib/content-storage/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ draftId: string }>;
};

const readDraftId = async (params: RouteParams["params"]): Promise<string> => {
  const { draftId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId ?? "")) {
    throw new SyntaxError("Identifiant de brouillon invalide.");
  }
  return draftId;
};

export async function GET(request: Request, { params }: RouteParams) {
  if (!isArticleCreationDraftsEnabled()) return articleCreationDraftsDisabledResponse();
  try {
    const access = await requireContentAccess(request);
    const draft = await ArticleCreationDraftRepository.getById(await readDraftId(params), access);
    if (!draft) {
      return privateJson({ ok: false, message: "Brouillon Article introuvable." }, { status: 404 });
    }
    return privateJson({ ok: true, draft });
  } catch (error) {
    return articleCreationDraftErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!isArticleCreationDraftsEnabled()) return articleCreationDraftsDisabledResponse();
  try {
    const access = await requireContentAccess(request);
    const draftId = await readDraftId(params);
    const input = validateUpdateArticleCreationDraftBody(await request.json());
    const result = await ArticleCreationDraftRepository.update(draftId, input, access);
    if (result.status === "not_found") {
      return privateJson({ ok: false, message: "Brouillon Article introuvable." }, { status: 404 });
    }
    if (result.status === "version_conflict") {
      return privateJson(
        {
          ok: false,
          code: "ARTICLE_DRAFT_VERSION_CONFLICT",
          message: "Une version plus recente de ce brouillon existe.",
          currentVersion: result.currentVersion,
        },
        { status: 409 },
      );
    }
    return privateJson({ ok: true, draft: result.draft });
  } catch (error) {
    return articleCreationDraftErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  if (!isArticleCreationDraftsEnabled()) return articleCreationDraftsDisabledResponse();
  try {
    const access = await requireContentAccess(request);
    const removed = await ArticleCreationDraftRepository.remove(await readDraftId(params), access);
    if (!removed) {
      return privateJson({ ok: false, message: "Brouillon Article introuvable." }, { status: 404 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    return articleCreationDraftErrorResponse(error);
  }
}
