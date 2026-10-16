import assert from "node:assert/strict";
import test from "node:test";
import { randomId } from "@/shared/lib/random-id";

test("HTTP browsers without randomUUID can create distinct workspace and request IDs", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const original = globalThis.crypto;
  let randomByteCalls = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(bytes: Uint8Array) {
        randomByteCalls++;
        return original.getRandomValues(bytes);
      },
    },
  });
  try {
    const ids = Array.from({ length: 256 }, () => randomId());
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(randomByteCalls, ids.length);
    for (const id of ids)
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
