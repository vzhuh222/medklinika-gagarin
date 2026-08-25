/**
 * Express 4 не перехватывает ошибки из async-обработчиков — без обёртки
 * упавший промис оставляет запрос висеть до таймаута.
 */
function wrapRouter(router) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    layer.route.stack = layer.route.stack.map((handlerLayer) => {
      const fn = handlerLayer.handle;
      if (fn.length >= 4 || fn.constructor.name !== 'AsyncFunction') return handlerLayer;
      handlerLayer.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
      return handlerLayer;
    });
  }
  return router;
}

module.exports = { wrapRouter };
