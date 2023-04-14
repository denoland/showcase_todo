import { HandlerContext } from "$fresh/server.ts";
import * as base58 from "$std/encoding/base58.ts";

export const handler = (req: Request, _ctx: HandlerContext): Response => {
  const listId = base58.encode(crypto.getRandomValues(new Uint8Array(8)));
  const url = new URL(req.url);
  return Response.redirect(`${url.origin}/${listId}`, 302);
};
