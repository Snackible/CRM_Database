export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const bad = (message, extra) => new HttpError(400, message, extra);
export const notFound = (what = "That") => new HttpError(404, `${what} was not found.`);
