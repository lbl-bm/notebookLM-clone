/**
 * 消息历史 API
 * GET /api/notebooks/:id/messages
 *
 * 性能优化：并行化 auth 和 notebook 所有权查询
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/db/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: notebookId } = await params;

    // 并行获取 auth 和 notebook 所有权（性能优化）
    const [userId, notebook] = await Promise.all([
      getCurrentUserId(),
      prisma.notebook.findUnique({
        where: { id: notebookId },
        select: { ownerId: true },
      }),
    ]);

    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    if (!notebook) {
      return NextResponse.json({ error: "Notebook 不存在" }, { status: 404 });
    }

    if (notebook.ownerId !== userId) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const before = searchParams.get("before");

    // 查询消息
    const messages = await prisma.message.findMany({
      where: {
        notebookId,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // 多取一条判断是否有更多
    });

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;

    // 按时间正序返回
    result.reverse();

    return NextResponse.json(
      {
        messages: result,
        hasMore,
        nextCursor: hasMore ? result[0]?.createdAt.toISOString() : undefined,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=5, stale-while-revalidate=10",
        },
      },
    );
  } catch (error) {
    console.error("[Messages API] 错误:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
