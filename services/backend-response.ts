import { isRecord } from "@/lib/records";

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function readBackendJson<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
      throw new BackendError("The banking service request timed out. Retry the request.", 504);
    if (!response.ok)
      throw new BackendError(
        "The banking service could not complete the request. Retry later.",
        response.status
      );
    throw new BackendError(
      "The banking service returned an invalid response. Retry the request.",
      502
    );
  }
  if (!response.ok) {
    let message = "The banking service could not complete the request. Retry later.";
    if (response.status < 500 && isRecord(payload)) {
      if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
      else if (typeof payload.detail === "string" && payload.detail.trim())
        message = payload.detail;
      else if (Array.isArray(payload.detail)) {
        const messages = payload.detail
          .filter(isRecord)
          .map((item) => item.msg)
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .slice(0, 3);
        if (messages.length) message = `Check the supplied values: ${messages.join("; ")}`;
      }
    }
    throw new BackendError(message.slice(0, 500), response.status);
  }
  return payload as T;
}
