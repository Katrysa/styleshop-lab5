'use strict';
/* errors.js — єдиний клас помилок HTTP для відповідей API */
class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
}
module.exports = { HttpError };
