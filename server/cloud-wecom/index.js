'use strict';
let handler;
exports.main = async (event, context) => {
  if (!handler) handler = (await import('./handler.mjs')).createCloudHandler();
  return handler(event, context);
};
