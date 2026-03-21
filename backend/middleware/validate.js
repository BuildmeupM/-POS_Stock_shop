const { ZodError } = require('zod')

/**
 * Express middleware: validate request body with a Zod schema.
 * Usage: router.post('/', validate(mySchema), handler)
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        return res.status(400).json({
          message: 'ข้อมูลไม่ถูกต้อง',
          errors: messages,
        })
      }
      next(err)
    }
  }
}

module.exports = { validate }
