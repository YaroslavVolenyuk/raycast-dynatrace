// Structured error types for the HTTP transport. UI layers map these to
// human-readable messages and distinct loading/empty/error states.

import { ZodError } from "zod";

export class RestError extends Error {
  constructor(
    public statusCode: number,
    public statusText: string,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "RestError";
  }
}

export class ValidationError extends Error {
  constructor(
    public zodError: ZodError,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DavisCopilotUnavailableError extends RestError {
  constructor() {
    super(403, "Forbidden", "Davis CoPilot requires a Platform Subscription or is not available in your environment");
    this.name = "DavisCopilotUnavailableError";
  }
}
