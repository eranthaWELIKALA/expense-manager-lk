/** Error codes the UI can branch on. Messages are safe to show to users. */
export const ErrorCode = {
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  INVALID: "invalid",
  AUTH: "auth",
  UNKNOWN: "unknown",
};

export class AppError extends Error {
  /** @param {string} code  @param {string} message  @param {unknown} [cause] */
  constructor(code, message, cause) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

export const isAppError = (e, code) => e instanceof AppError && (!code || e.code === code);

/** A user-facing message for any thrown value. Never leaks stack traces. */
export const errorMessage = (e) =>
  (e instanceof AppError && e.message) || (e instanceof Error && e.message) || "Something went wrong. Please try again.";
