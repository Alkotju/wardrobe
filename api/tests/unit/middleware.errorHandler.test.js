// errorHandler is the last express middleware. It must map specific error
// kinds to specific status codes and never leak stack traces in the JSON body.

const multer = require('multer');
const errorHandler = require('../../src/middleware/errorHandler');

function mockRes() {
  const res = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  // Quietly suppress the console.error the handler emits for 5xx errors so the
  // test runner output stays clean — but assert the call happened.
  let errSpy;
  beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errSpy.mockRestore(); });

  test('does nothing when headers already sent', () => {
    const res = mockRes();
    res.headersSent = true;
    errorHandler(new Error('boom'), {}, res, jest.fn());
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test('413 for multer LIMIT_FILE_SIZE', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'File too large' });
  });

  test('400 for other multer errors with message', () => {
    const err = new multer.MulterError('LIMIT_FIELD_COUNT');
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
  });

  test('400 for Mongoose ValidationError', () => {
    const err = new Error('bad data');
    err.name = 'ValidationError';
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'bad data' });
  });

  test('400 for Mongoose CastError', () => {
    const err = new Error('cast');
    err.name = 'CastError';
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('honours explicit err.status', () => {
    const err = new Error('teapot');
    err.status = 418;
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ error: 'teapot' });
  });

  test('500 default for unknown errors and logs to console', () => {
    const res = mockRes();
    errorHandler(new Error('unexpected'), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'unexpected' });
    expect(errSpy).toHaveBeenCalled();
  });

  test('falls back to "Internal server error" when error has no message', () => {
    const res = mockRes();
    const err = new Error();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
