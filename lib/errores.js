class ErrorNegocio extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ErrorNegocio";
    this.status = status;
    Error.captureStackTrace?.(this, ErrorNegocio);
  }
}

module.exports = { ErrorNegocio };
