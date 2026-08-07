import { Liveblocks } from "@liveblocks/node"

let _liveblocks: Liveblocks | undefined;

function makeLiveblocks() {
  if (!process.env.LIVEBLOCKS_SECRET_KEY) {
    throw new Error("LIVEBLOCKS_SECRET_KEY is not set");
  }
  return new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY });
}

export function getLiveblocks() {
  if (!_liveblocks) _liveblocks = makeLiveblocks();
  return _liveblocks;
}
