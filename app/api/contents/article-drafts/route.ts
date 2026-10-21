import { isArticleCreationDraftsEnabled } from "@/lib/article-creation-drafts/activation";
import {
  articleCreationDraftErrorResponse,
  articleCreationDraftStorageScope,
  articleCreationDraftsDisabledResponse,
  privateJson,
} from "@/lib/article-creation-drafts/http";
import { ArticleCreationDraftRepository } from "@/lib/article-creation-drafts/repository";
import { validateCreateArticleCreationDraftBody } from "@/lib/article-creation-drafts/validation";
import { requireContentAccess } from "@/lib/content-storage/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isArticleCreationDraftsEnabled()) return articleCreationDraftsDisabledResponse();
  try {
    const access = await requireContentAccess(request);
    const drafts = await ArticleCreationDraftRepository.list(access);
    return privateJson({
      ok: true,
      storageScope: articleCreationDraftStorageScope(access),
      drafts,
    });
  } catch (error) {
    return articleCreationDraftErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isArticleCreationDraftsEnabled()) return articleCreationDraftsDisabledResponse();
  try {
    const access = await requireContentAccess(request);
    const input = validateCreateArticleCreationDraftBody(await request.json());
    const draft = await ArticleCreationDraftRepository.createOrGet(input, access);
    if (!draft) {
      return privateJson(
        {
          ok: false,
          code: "ARTICLE_DRAFT_CREATION_RETIRED",
          message: "Cette tentative de creation ne peut plus etre reprise. Creez un nouveau brouillon.",
        },
        { status: 409 },
      );
    }
    return privateJson({ ok: true, draft }, { status: 201 });
  } catch (error) {
    return articleCreationDraftErrorResponse(error);
  }
}
