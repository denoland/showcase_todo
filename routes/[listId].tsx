import { Head } from "$fresh/runtime.ts";
import { Handlers } from "$fresh/server.ts";
import TodoListView from "../islands/TodoListView.tsx";
import { db, inputSchema, loadList, writeItems } from "../services/database.ts";
import { TodoList } from "../shared/api.ts";

export const handler: Handlers = {
  GET: async (req, ctx) => {
    const listId = ctx.params.listId;
    const accept = req.headers.get("accept");
    const url = new URL(req.url);

    if (accept === "text/event-stream") {
      const stream = db.watch([["list_updated", listId]]).getReader();
      const body = new ReadableStream({
        async start(controller) {
          console.log(
            `Opened stream for list ${listId} remote ${
              JSON.stringify(ctx.remoteAddr)
            }`,
          );
          while (true) {
            try {
              if ((await stream.read()).done) {
                return;
              }

              const data = await loadList(listId, "strong");
              const chunk = `data: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(new TextEncoder().encode(chunk));
            } catch (e) {
              console.error(`Error refreshing list ${listId}`, e);
            }
          }
        },
        cancel() {
          stream.cancel();
          console.log(
            `Closed stream for list ${listId} remote ${
              JSON.stringify(ctx.remoteAddr)
            }`,
          );
        },
      });
      return new Response(body, {
        headers: {
          "content-type": "text/event-stream",
        },
      });
    }

    const startTime = Date.now();
    const data = await loadList(
      listId,
      url.searchParams.get("consistency") === "strong" ? "strong" : "eventual",
    );
    const endTime = Date.now();
    const res = await ctx.render({ data, latency: endTime - startTime });
    res.headers.set("x-list-load-time", "" + (endTime - startTime));
    return res;
  },
  POST: async (req, ctx) => {
    const listId = ctx.params.listId;
    const body = inputSchema.parse(await req.json());
    await writeItems(listId, body);
    return Response.json({ ok: true });
  },
};

export default function Home(
  { data: { data, latency } }: { data: { data: TodoList; latency: number } },
) {
  return (
    <>
      <Head>
        <title>Todo List</title>
      </Head>
      <div class="p-4 mx-auto max-w-screen-md">
        <TodoListView initialData={data} latency={latency} />
      </div>
    </>
  );
}
